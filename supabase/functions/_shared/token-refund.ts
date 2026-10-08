// deno-lint-ignore no-explicit-any
type ServiceClient = any;

/** Devolve o token de uma mensagem que nao foi entregue; no maximo uma vez por mensagem. */
export async function refundMessageToken(supabase: ServiceClient, tenantId: string, messageId: string): Promise<boolean> {
  const { data: already } = await supabase.from('token_transactions').select('id')
    .eq('tenant_id', tenantId).eq('type', 'refund').eq('reference_id', messageId).limit(1);
  if (already?.length) return false;
  const { data, error } = await supabase.rpc('add_tokens', {
    _tenant_id: tenantId, _amount: 1, _type: 'refund',
    _description: 'Reembolso: mensagem não entregue', _reference_id: messageId,
  });
  return !error && data === true;
}
