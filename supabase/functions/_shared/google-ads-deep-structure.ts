/** Datasets de ESTRUTURA da conta (o que existe e como esta configurado) + desempenho de vida inteira. Somente leitura. */
import { gaqlSearch } from "./google-ads-api.ts";
import { base, type Dataset, type DatasetCtx, lastId, localToUtcIso, met, METRICS, nul, num, type Row, str } from "./google-ads-deep-types.ts";

const search = (ctx: DatasetCtx, q: string): Promise<Row[]> => gaqlSearch(ctx.creds, ctx.customerId, q) as Promise<Row[]>;
const life = (ctx: DatasetCtx) => `segments.date BETWEEN '${ctx.lifetimeStart}' AND '${ctx.end}'`;
const text = (list: unknown): string[] => (Array.isArray(list) ? list.map((x: Row) => String(x?.text ?? "")).filter(Boolean) : []);

const adGroups: Dataset = {
  name: "ad_groups", table: "google_ads_ad_groups", conflict: "account_id,ad_group_id", snap: null,
  async fetch(ctx) {
    const [groups, metrics] = await Promise.all([
      search(ctx, "SELECT campaign.id, ad_group.id, ad_group.name, ad_group.status, ad_group.type, ad_group.cpc_bid_micros FROM ad_group"),
      search(ctx, `SELECT ad_group.id, ${METRICS} FROM ad_group WHERE ${life(ctx)}`),
    ]);
    const m = new Map(metrics.map((r) => [String(r.adGroup?.id), met(r)]));
    return groups.map((r) => ({
      ...base(ctx), ad_group_id: num(r.adGroup?.id), campaign_id: num(r.campaign?.id), name: str(r.adGroup?.name) ?? "(sem nome)",
      status: str(r.adGroup?.status) ?? "UNKNOWN", type: str(r.adGroup?.type), cpc_bid_micros: nul(r.adGroup?.cpcBidMicros),
      ...(m.get(String(r.adGroup?.id)) ?? met({})),
    }));
  },
};

const ads: Dataset = {
  name: "ads", table: "google_ads_ads", conflict: "account_id,ad_group_id,ad_id", snap: null,
  async fetch(ctx) {
    const [list, metrics] = await Promise.all([
      search(ctx, `SELECT campaign.id, ad_group.id, ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.ad.name, ad_group_ad.ad.final_urls,
        ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.status,
        ad_group_ad.ad_strength, ad_group_ad.policy_summary.approval_status FROM ad_group_ad`),
      search(ctx, `SELECT ad_group.id, ad_group_ad.ad.id, ${METRICS} FROM ad_group_ad WHERE ${life(ctx)}`),
    ]);
    const m = new Map(metrics.map((r) => [`${r.adGroup?.id}|${r.adGroupAd?.ad?.id}`, met(r)]));
    return list.map((r) => {
      const ad = r.adGroupAd?.ad ?? {};
      return {
        ...base(ctx), ad_id: num(ad.id), ad_group_id: num(r.adGroup?.id), campaign_id: num(r.campaign?.id),
        type: str(ad.type), name: str(ad.name), status: str(r.adGroupAd?.status) ?? "UNKNOWN", ad_strength: str(r.adGroupAd?.adStrength),
        approval_status: str(r.adGroupAd?.policySummary?.approvalStatus), final_url: str(ad.finalUrls?.[0]),
        headlines: text(ad.responsiveSearchAd?.headlines), descriptions: text(ad.responsiveSearchAd?.descriptions),
        ...(m.get(`${r.adGroup?.id}|${ad.id}`) ?? met({})),
      };
    });
  },
};

const keywords: Dataset = {
  name: "keywords", table: "google_ads_keywords", conflict: "account_id,ad_group_id,criterion_id", snap: null,
  async fetch(ctx) {
    const [list, metrics] = await Promise.all([
      search(ctx, `SELECT campaign.id, ad_group.id, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.negative,
        ad_group_criterion.quality_info.quality_score, ad_group_criterion.quality_info.creative_quality_score,
        ad_group_criterion.quality_info.post_click_quality_score, ad_group_criterion.quality_info.search_predicted_ctr,
        ad_group_criterion.effective_cpc_bid_micros FROM ad_group_criterion WHERE ad_group_criterion.type = 'KEYWORD'`),
      search(ctx, `SELECT ad_group.id, ad_group_criterion.criterion_id, ${METRICS} FROM keyword_view WHERE ${life(ctx)}`),
    ]);
    const m = new Map(metrics.map((r) => [`${r.adGroup?.id}|${r.adGroupCriterion?.criterionId}`, met(r)]));
    return list.map((r) => {
      const c = r.adGroupCriterion ?? {};
      const q = c.qualityInfo ?? {};
      return {
        ...base(ctx), ad_group_id: num(r.adGroup?.id), criterion_id: num(c.criterionId), campaign_id: num(r.campaign?.id),
        text: str(c.keyword?.text) ?? "", match_type: str(c.keyword?.matchType), status: str(c.status) ?? "UNKNOWN", negative: c.negative === true,
        quality_score: nul(q.qualityScore), creative_quality: str(q.creativeQualityScore), landing_page_quality: str(q.postClickQualityScore),
        predicted_ctr: str(q.searchPredictedCtr), cpc_bid_micros: nul(c.effectiveCpcBidMicros),
        ...(m.get(`${r.adGroup?.id}|${c.criterionId}`) ?? met({})),
      };
    });
  },
};

const assetGroups: Dataset = {
  name: "asset_groups", table: "google_ads_asset_groups", conflict: "account_id,asset_group_id", snap: null,
  async fetch(ctx) {
    const rows = await search(ctx, "SELECT campaign.id, asset_group.id, asset_group.name, asset_group.status, asset_group.ad_strength, asset_group.primary_status FROM asset_group");
    return rows.map((r) => ({
      ...base(ctx), asset_group_id: num(r.assetGroup?.id), campaign_id: num(r.campaign?.id), name: str(r.assetGroup?.name) ?? "(sem nome)",
      status: str(r.assetGroup?.status) ?? "UNKNOWN", ad_strength: str(r.assetGroup?.adStrength), primary_status: str(r.assetGroup?.primaryStatus),
    }));
  },
};

const assetGroupAssets: Dataset = {
  name: "asset_group_assets", table: "google_ads_asset_group_assets", conflict: "account_id,asset_group_id,asset_id,field_type", snap: null,
  async fetch(ctx) {
    const rows = await search(ctx, `SELECT asset_group.id, asset_group_asset.field_type, asset_group_asset.status, asset.id, asset.type, asset.name,
      asset.text_asset.text FROM asset_group_asset`);
    return rows.map((r) => ({
      ...base(ctx), asset_group_id: num(r.assetGroup?.id), asset_id: num(r.asset?.id), field_type: str(r.assetGroupAsset?.fieldType) ?? "UNKNOWN",
      status: str(r.assetGroupAsset?.status), asset_type: str(r.asset?.type), name: str(r.asset?.name), text: str(r.asset?.textAsset?.text),
    }));
  },
};

const negatives: Dataset = {
  name: "negatives", table: "google_ads_negatives", conflict: "account_id,source,ref_id", snap: null,
  async fetch(ctx) {
    const [camp, shared] = await Promise.all([
      search(ctx, `SELECT campaign.id, campaign_criterion.criterion_id, campaign_criterion.type, campaign_criterion.keyword.text,
        campaign_criterion.keyword.match_type FROM campaign_criterion WHERE campaign_criterion.negative = TRUE`),
      search(ctx, "SELECT shared_set.id, shared_set.name, shared_set.type, shared_set.member_count FROM shared_set"),
    ]);
    return [
      ...camp.map((r) => ({
        ...base(ctx), source: "campaign", ref_id: `${r.campaign?.id}~${r.campaignCriterion?.criterionId}`, campaign_id: num(r.campaign?.id),
        text: str(r.campaignCriterion?.keyword?.text), match_type: str(r.campaignCriterion?.keyword?.matchType), type: str(r.campaignCriterion?.type), member_count: null,
      })),
      ...shared.map((r) => ({
        ...base(ctx), source: "shared_set", ref_id: String(r.sharedSet?.id), campaign_id: null, text: str(r.sharedSet?.name), match_type: null,
        type: str(r.sharedSet?.type), member_count: nul(r.sharedSet?.memberCount),
      })),
    ];
  },
};

const userLists: Dataset = {
  name: "user_lists", table: "google_ads_user_lists", conflict: "account_id,user_list_id", snap: null,
  async fetch(ctx) {
    const rows = await search(ctx, `SELECT user_list.id, user_list.name, user_list.type, user_list.size_for_search, user_list.size_for_display,
      user_list.membership_status, user_list.membership_life_span FROM user_list`);
    return rows.map((r) => ({
      ...base(ctx), user_list_id: num(r.userList?.id), name: str(r.userList?.name) ?? "(sem nome)", type: str(r.userList?.type),
      size_for_search: nul(r.userList?.sizeForSearch), size_for_display: nul(r.userList?.sizeForDisplay),
      membership_status: str(r.userList?.membershipStatus), membership_life_span: nul(r.userList?.membershipLifeSpan),
    }));
  },
};

const biddingStrategies: Dataset = {
  name: "bidding_strategies", table: "google_ads_bidding_strategies", conflict: "account_id,strategy_id", snap: null,
  async fetch(ctx) {
    const rows = await search(ctx, `SELECT bidding_strategy.id, bidding_strategy.name, bidding_strategy.type, bidding_strategy.target_roas.target_roas,
      bidding_strategy.target_cpa.target_cpa_micros FROM bidding_strategy`);
    return rows.map((r) => ({
      ...base(ctx), strategy_id: num(r.biddingStrategy?.id), name: str(r.biddingStrategy?.name), type: str(r.biddingStrategy?.type),
      target_roas: nul(r.biddingStrategy?.targetRoas?.targetRoas), target_cpa_micros: nul(r.biddingStrategy?.targetCpa?.targetCpaMicros),
    }));
  },
};

const googleRecs: Dataset = {
  name: "google_recommendations", table: "google_ads_google_recommendations", conflict: "account_id,rec_key", snap: null,
  async fetch(ctx) {
    const rows = await search(ctx, "SELECT recommendation.type, recommendation.campaign, recommendation.dismissed FROM recommendation");
    return rows.map((r) => ({
      ...base(ctx), rec_key: lastId(r.recommendation?.resourceName) ?? "", type: str(r.recommendation?.type) ?? "UNKNOWN",
      campaign_id: nul(lastId(r.recommendation?.campaign)), dismissed: r.recommendation?.dismissed === true,
    })).filter((r) => r.rec_key);
  },
};

const changes: Dataset = {
  name: "changes", table: "google_ads_changes", conflict: "account_id,event_key", snap: null,
  async fetch(ctx) {
    // change_event so guarda 30 dias: janela fixa de 29 dias terminando hoje (UTC).
    const to = new Date(`${ctx.end}T00:00:00Z`);
    const from = new Date(to.getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
    const until = new Date(to.getTime() + 86_400_000).toISOString().slice(0, 10);
    const tz = String((await search(ctx, "SELECT customer.time_zone FROM customer"))[0]?.customer?.timeZone ?? "") || null;
    const rows = await search(ctx, `SELECT change_event.change_date_time, change_event.change_resource_type, change_event.resource_change_operation,
      change_event.changed_fields, change_event.user_email, change_event.client_type, change_event.campaign FROM change_event
      WHERE change_event.change_date_time >= '${from}' AND change_event.change_date_time < '${until}' ORDER BY change_event.change_date_time DESC LIMIT 10000`);
    return rows.map((r) => {
      const e = r.changeEvent ?? {};
      const fields = e.changedFields;
      return {
        ...base(ctx), event_key: lastId(e.resourceName) ?? "", changed_at: localToUtcIso(String(e.changeDateTime ?? ""), tz) ?? "",
        resource_type: str(e.changeResourceType), operation: str(e.resourceChangeOperation),
        changed_fields: (typeof fields === "string" ? fields : Array.isArray(fields?.paths) ? fields.paths.join(",") : "").slice(0, 500) || null,
        user_email: str(e.userEmail), client_type: str(e.clientType), campaign_resource: str(e.campaign),
      };
    }).filter((r) => r.event_key && r.changed_at.length > 5);
  },
};

const conversionGoals: Dataset = {
  name: "conversion_goals", table: "google_ads_conversion_goals", conflict: "account_id,category,origin", snap: null,
  async fetch(ctx) {
    const rows = await search(ctx, "SELECT customer_conversion_goal.category, customer_conversion_goal.origin, customer_conversion_goal.biddable FROM customer_conversion_goal");
    return rows.map((r) => ({
      ...base(ctx), category: str(r.customerConversionGoal?.category) ?? "UNKNOWN", origin: str(r.customerConversionGoal?.origin) ?? "UNKNOWN",
      // O Google OMITE o campo quando o valor e false (proto3): ausente = desligado.
      biddable: r.customerConversionGoal?.biddable === true,
    }));
  },
};

export const STRUCTURE_DATASETS: Dataset[] = [conversionGoals, adGroups, ads, keywords, assetGroups, assetGroupAssets, negatives, userLists, biddingStrategies, googleRecs, changes];
