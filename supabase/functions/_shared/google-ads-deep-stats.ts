/** Datasets de DESEMPENHO detalhado (termos, dispositivo, hora, regiao, produtos, paginas, publico...). Somente leitura. */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { gaqlSearch } from "./google-ads-api.ts";
import { base, type Dataset, type DatasetCtx, lastId, met, METRIC_FIELDS, METRICS, mergeRows, nul, num, type Row, str } from "./google-ads-deep-types.ts";

const search = (ctx: DatasetCtx, q: string): Promise<Row[]> => gaqlSearch(ctx.creds, ctx.customerId, q) as Promise<Row[]>;
const range = (ctx: DatasetCtx) => `segments.date BETWEEN '${ctx.start}' AND '${ctx.end}'`;
const life = (ctx: DatasetCtx) => `segments.date BETWEEN '${ctx.lifetimeStart}' AND '${ctx.end}'`;
const monthOf = (v: unknown): string => String(v ?? "").slice(0, 10);

const searchTerms: Dataset = {
  name: "search_terms", table: "google_ads_search_terms", conflict: "account_id,campaign_id,ad_group_id,search_term,year", snap: "year", sum: METRIC_FIELDS,
  async fetch(ctx) {
    const rows = await search(ctx, `SELECT campaign.id, ad_group.id, search_term_view.search_term, search_term_view.status, segments.year, ${METRICS}
      FROM search_term_view WHERE ${range(ctx)}`);
    return rows.map((r) => ({
      ...base(ctx), campaign_id: num(r.campaign?.id), ad_group_id: num(r.adGroup?.id), search_term: str(r.searchTermView?.searchTerm) ?? "",
      year: num(r.segments?.year), status: str(r.searchTermView?.status), ...met(r),
    })).filter((r) => r.search_term && r.year > 2000);
  },
};

const deviceMonthly: Dataset = {
  name: "device_monthly", table: "google_ads_device_monthly", conflict: "account_id,campaign_id,device,month", snap: "month", sum: METRIC_FIELDS,
  async fetch(ctx) {
    const rows = await search(ctx, `SELECT campaign.id, segments.device, segments.month, ${METRICS} FROM campaign WHERE ${range(ctx)}`);
    return rows.map((r) => ({ ...base(ctx), campaign_id: num(r.campaign?.id), device: str(r.segments?.device) ?? "UNKNOWN", month: monthOf(r.segments?.month), ...met(r) }))
      .filter((r) => r.month);
  },
};

const hourStats: Dataset = {
  name: "hour_stats", table: "google_ads_hour_stats", conflict: "account_id,year,day_of_week,hour", snap: "year", sum: METRIC_FIELDS,
  async fetch(ctx) {
    const rows = await search(ctx, `SELECT segments.day_of_week, segments.hour, segments.year, ${METRICS} FROM customer WHERE ${range(ctx)}`);
    return rows.map((r) => ({ ...base(ctx), year: num(r.segments?.year), day_of_week: str(r.segments?.dayOfWeek) ?? "UNKNOWN", hour: num(r.segments?.hour), ...met(r) }));
  },
};

const impressionShare: Dataset = {
  name: "impression_share", table: "google_ads_impression_share", conflict: "account_id,campaign_id,month", snap: "month",
  async fetch(ctx) {
    const rows = await search(ctx, `SELECT campaign.id, segments.month, metrics.impressions, metrics.search_impression_share, metrics.search_top_impression_share,
      metrics.search_absolute_top_impression_share, metrics.search_budget_lost_impression_share, metrics.search_rank_lost_impression_share
      FROM campaign WHERE ${range(ctx)} AND campaign.advertising_channel_type = 'SEARCH'`);
    return rows.map((r) => ({
      ...base(ctx), campaign_id: num(r.campaign?.id), month: monthOf(r.segments?.month), impressions: num(r.metrics?.impressions),
      search_impression_share: nul(r.metrics?.searchImpressionShare), search_top_impression_share: nul(r.metrics?.searchTopImpressionShare),
      search_abs_top_impression_share: nul(r.metrics?.searchAbsoluteTopImpressionShare),
      search_budget_lost_share: nul(r.metrics?.searchBudgetLostImpressionShare), search_rank_lost_share: nul(r.metrics?.searchRankLostImpressionShare),
    })).filter((r) => r.month);
  },
};

const campaignConversions: Dataset = {
  name: "campaign_conversions", table: "google_ads_campaign_conversions", conflict: "account_id,campaign_id,month,conversion_action_name", snap: "month",
  sum: ["conversions", "conversions_value"],
  async fetch(ctx) {
    const rows = await search(ctx, `SELECT campaign.id, segments.month, segments.conversion_action_name, metrics.conversions, metrics.conversions_value
      FROM campaign WHERE ${range(ctx)} AND metrics.conversions > 0`);
    return rows.map((r) => ({
      ...base(ctx), campaign_id: num(r.campaign?.id), month: monthOf(r.segments?.month),
      conversion_action_name: str(r.segments?.conversionActionName) ?? "(sem nome)", conversions: num(r.metrics?.conversions), conversions_value: num(r.metrics?.conversionsValue),
    })).filter((r) => r.month);
  },
};

const products: Dataset = {
  name: "products", table: "google_ads_products", conflict: "account_id,item_id", snap: null, sum: METRIC_FIELDS,
  async fetch(ctx) {
    const rows = await search(ctx, `SELECT segments.product_item_id, segments.product_title, segments.product_brand, segments.product_type_l1, ${METRICS}
      FROM shopping_performance_view WHERE ${life(ctx)}`);
    return rows.filter((r) => str(r.segments?.productItemId)).map((r) => ({
      ...base(ctx), item_id: String(r.segments.productItemId), title: str(r.segments?.productTitle), brand: str(r.segments?.productBrand),
      type_l1: str(r.segments?.productTypeL1), ...met(r),
    }));
  },
};

const landingPages: Dataset = {
  name: "landing_pages", table: "google_ads_landing_pages", conflict: "account_id,url", snap: null, sum: METRIC_FIELDS,
  async fetch(ctx) {
    const rows = await search(ctx, `SELECT landing_page_view.unexpanded_final_url, metrics.speed_score, metrics.mobile_friendly_clicks_percentage, ${METRICS}
      FROM landing_page_view WHERE ${life(ctx)}`);
    return rows.filter((r) => str(r.landingPageView?.unexpandedFinalUrl)).map((r) => ({
      ...base(ctx), url: String(r.landingPageView.unexpandedFinalUrl).slice(0, 1000), speed_score: nul(r.metrics?.speedScore),
      mobile_friendly_clicks_pct: nul(r.metrics?.mobileFriendlyClicksPercentage), ...met(r),
    }));
  },
};

const demographics: Dataset = {
  name: "demographics", table: "google_ads_demographics", conflict: "account_id,campaign_id,dimension,value", snap: null, sum: METRIC_FIELDS,
  async fetch(ctx) {
    const [age, gender] = await Promise.all([
      search(ctx, `SELECT campaign.id, ad_group_criterion.age_range.type, ${METRICS} FROM age_range_view WHERE ${life(ctx)}`),
      search(ctx, `SELECT campaign.id, ad_group_criterion.gender.type, ${METRICS} FROM gender_view WHERE ${life(ctx)}`),
    ]);
    return [
      ...age.map((r) => ({ ...base(ctx), campaign_id: num(r.campaign?.id), dimension: "age", value: str(r.adGroupCriterion?.ageRange?.type) ?? "UNKNOWN", ...met(r) })),
      ...gender.map((r) => ({ ...base(ctx), campaign_id: num(r.campaign?.id), dimension: "gender", value: str(r.adGroupCriterion?.gender?.type) ?? "UNKNOWN", ...met(r) })),
    ];
  },
};

const geo: Dataset = {
  name: "geo", table: "google_ads_geo_stats", conflict: "account_id,campaign_id,region_key,location_type", snap: null, sum: METRIC_FIELDS,
  async fetch(ctx) {
    const rows = await search(ctx, `SELECT campaign.id, geographic_view.country_criterion_id, geographic_view.location_type, segments.geo_target_region, ${METRICS}
      FROM geographic_view WHERE ${life(ctx)}`);
    const keyOf = (r: Row) => lastId(r.segments?.geoTargetRegion) ?? (r.geographicView?.countryCriterionId ? `country:${r.geographicView.countryCriterionId}` : "unknown");
    const ids = [...new Set(rows.map(keyOf).filter((k) => /^\d+$/.test(k)))];
    const names = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100).join(", ");
      const geo = await search(ctx, `SELECT geo_target_constant.id, geo_target_constant.canonical_name FROM geo_target_constant WHERE geo_target_constant.id IN (${chunk})`);
      for (const g of geo) names.set(String(g.geoTargetConstant?.id), String(g.geoTargetConstant?.canonicalName ?? ""));
    }
    return rows.map((r) => {
      const key = keyOf(r);
      return {
        ...base(ctx), campaign_id: num(r.campaign?.id), region_key: key, region_name: names.get(key) ?? null,
        location_type: str(r.geographicView?.locationType) ?? "UNKNOWN", ...met(r),
      };
    });
  },
};

const campaignExtra: Dataset = {
  name: "campaign_settings", table: "google_ads_campaigns", conflict: "account_id,campaign_id", snap: null,
  async fetch(ctx) {
    const rows = await search(ctx, `SELECT campaign.id, campaign.name, campaign.status, campaign.optimization_score, campaign.maximize_conversion_value.target_roas,
      campaign.target_roas.target_roas, campaign.maximize_conversions.target_cpa_micros, campaign.target_cpa.target_cpa_micros,
      campaign.network_settings.target_search_network, campaign.network_settings.target_content_network, campaign.bidding_strategy FROM campaign`);
    return rows.map((r) => {
      const c = r.campaign ?? {};
      return {
        ...base(ctx), campaign_id: num(c.id), name: str(c.name) ?? "(sem nome)", status: str(c.status) ?? "UNKNOWN",
        optimization_score: nul(c.optimizationScore), target_roas: nul(c.maximizeConversionValue?.targetRoas ?? c.targetRoas?.targetRoas),
        target_cpa_micros: nul(c.maximizeConversions?.targetCpaMicros ?? c.targetCpa?.targetCpaMicros),
        bidding_strategy_resource: str(c.biddingStrategy),
        search_network: typeof c.networkSettings?.targetSearchNetwork === "boolean" ? c.networkSettings.targetSearchNetwork : null,
        content_network: typeof c.networkSettings?.targetContentNetwork === "boolean" ? c.networkSettings.targetContentNetwork : null,
      };
    });
  },
};

const accountSettings: Dataset = {
  name: "account_settings", table: null, conflict: "", snap: null,
  fetch: () => Promise.resolve([]),
  async custom(ctx, supabase) {
    const rows = await search(ctx, `SELECT customer.auto_tagging_enabled, customer.optimization_score, customer.conversion_tracking_setting.conversion_tracking_status FROM customer`);
    const c = rows[0]?.customer ?? {};
    const { error } = await (supabase as SupabaseClient).from("google_ads_accounts").update({
      auto_tagging_enabled: typeof c.autoTaggingEnabled === "boolean" ? c.autoTaggingEnabled : null,
      optimization_score: nul(c.optimizationScore), conversion_tracking_status: str(c.conversionTrackingSetting?.conversionTrackingStatus),
    }).eq("id", ctx.accountId);
    if (error) throw new Error(`conta: ${error.message}`);
    return 1;
  },
};

export const STATS_DATASETS: Dataset[] = [
  searchTerms, deviceMonthly, hourStats, impressionShare, campaignConversions, products, landingPages, demographics, geo, campaignExtra, accountSettings,
];
export { mergeRows };
