import { useState, useEffect } from "react";
import type { WatchlistRule, KeywordResponse } from "@/hooks/useInstagramAutomations";

export type ResponseMode = "single" | "multi";

interface Options {
  open: boolean;
  rule: WatchlistRule | null;
  mediaType: "post" | "reel";
  onSave: (data: Partial<WatchlistRule> & { media_type: string }) => Promise<void>;
  onOpenChange: (open: boolean) => void;
}

export function useCommentToDmRule({ open, rule, mediaType, onSave, onOpenChange }: Options) {
  const [ruleName, setRuleName] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [watchMode, setWatchMode] = useState<"all" | "specific">("all");
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [selectedMediaCaption, setSelectedMediaCaption] = useState<string | null>(null);
  const [responseMode, setResponseMode] = useState<ResponseMode>("single");

  const [keywords, setKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState("");
  const [dmMessage, setDmMessage] = useState("");

  const [keywordResponses, setKeywordResponses] = useState<KeywordResponse[]>([]);
  const [newKrKeyword, setNewKrKeyword] = useState("");
  const [newKrMessage, setNewKrMessage] = useState("");

  const [replyVariants, setReplyVariants] = useState<string[]>([]);
  const [newVariant, setNewVariant] = useState("");
  const [privateReplyEnabled, setPrivateReplyEnabled] = useState(true);
  const [publicReplyEnabled, setPublicReplyEnabled] = useState(false);
  const [firstCommentOnly, setFirstCommentOnly] = useState(true);
  const [delaySeconds, setDelaySeconds] = useState(3);
  const [isSaving, setIsSaving] = useState(false);
  const [mediaSelectorOpen, setMediaSelectorOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const kr = rule?.keyword_responses ?? [];
    setRuleName(rule?.rule_name ?? "");
    setIsActive(rule?.is_active ?? false);
    setWatchMode(rule?.watch_mode === "specific" ? "specific" : "all");
    setSelectedMediaId(rule?.media_id ?? null);
    setSelectedMediaCaption(null);
    setResponseMode(kr.length > 0 ? "multi" : "single");
    setKeywords(rule?.keywords_include ?? []);
    setNewKeyword("");
    setDmMessage(rule?.dm_message ?? "");
    setKeywordResponses(kr);
    setNewKrKeyword("");
    setNewKrMessage("");
    setReplyVariants(rule?.reply_public_variants ?? []);
    setNewVariant("");
    setPrivateReplyEnabled(rule?.private_reply_enabled ?? true);
    setPublicReplyEnabled(rule?.reply_public_enabled ?? false);
    setFirstCommentOnly(rule?.first_comment_only ?? true);
    setDelaySeconds(rule?.delay_seconds ?? 3);
  }, [open, rule]);

  const addKeyword = () => {
    const kw = newKeyword.trim().toLowerCase();
    if (kw && !keywords.includes(kw)) { setKeywords([...keywords, kw]); setNewKeyword(""); }
  };

  const removeKeyword = (kw: string) => setKeywords(keywords.filter(k => k !== kw));

  const addKeywordResponse = () => {
    const kw = newKrKeyword.trim().toLowerCase();
    const msg = newKrMessage.trim();
    if (kw && msg && !keywordResponses.some(kr => kr.keyword === kw)) {
      setKeywordResponses([...keywordResponses, { keyword: kw, dm_message: msg }]);
      setNewKrKeyword("");
      setNewKrMessage("");
    }
  };

  const removeKeywordResponse = (keyword: string) =>
    setKeywordResponses(keywordResponses.filter(kr => kr.keyword !== keyword));

  const addVariant = () => {
    const v = newVariant.trim();
    if (v && !replyVariants.includes(v)) { setReplyVariants([...replyVariants, v]); setNewVariant(""); }
  };

  const removeVariant = (idx: number) => setReplyVariants(replyVariants.filter((_, i) => i !== idx));

  const clearSpecificMedia = () => { setWatchMode("all"); setSelectedMediaId(null); setSelectedMediaCaption(null); };

  const handleMediaSelect = (media: { id: string; caption: string | null }) => {
    setSelectedMediaId(media.id);
    setSelectedMediaCaption(media.caption);
    setWatchMode("specific");
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const isMulti = responseMode === "multi";
      const pendingVariant = newVariant.trim();
      const finalVariants = pendingVariant && !replyVariants.includes(pendingVariant)
        ? [...replyVariants, pendingVariant]
        : replyVariants;
      await onSave({
        id: rule?.id,
        media_type: mediaType,
        rule_name: ruleName || null,
        watch_mode: watchMode,
        media_id: watchMode === "specific" ? selectedMediaId : null,
        is_active: isActive,
        keywords_include: isMulti ? keywordResponses.map(kr => kr.keyword) : (keywords.length > 0 ? keywords : null),
        dm_message: isMulti ? null : (dmMessage || null),
        keyword_responses: isMulti ? keywordResponses : [],
        reply_public_enabled: publicReplyEnabled,
        reply_public_variants: finalVariants.length > 0 ? finalVariants : null,
        private_reply_enabled: privateReplyEnabled,
        first_comment_only: firstCommentOnly,
        delay_seconds: delaySeconds,
      });
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  const canSave = responseMode === "multi" ? keywordResponses.length > 0 : true;

  return {
    ruleName, setRuleName, isActive, setIsActive,
    watchMode, setWatchMode, selectedMediaId, selectedMediaCaption, clearSpecificMedia, handleMediaSelect,
    responseMode, setResponseMode,
    keywords, newKeyword, setNewKeyword, addKeyword, removeKeyword, dmMessage, setDmMessage,
    keywordResponses, newKrKeyword, setNewKrKeyword, newKrMessage, setNewKrMessage, addKeywordResponse, removeKeywordResponse,
    replyVariants, newVariant, setNewVariant, addVariant, removeVariant,
    privateReplyEnabled, setPrivateReplyEnabled, publicReplyEnabled, setPublicReplyEnabled,
    firstCommentOnly, setFirstCommentOnly, delaySeconds, setDelaySeconds,
    isSaving, mediaSelectorOpen, setMediaSelectorOpen,
    handleSave, canSave,
  };
}
