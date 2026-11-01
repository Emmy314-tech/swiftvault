export const resolveTransactionProvider = (transactionType) => {
  if (["airtime", "data_purchase", "cable_tv", "electricity", "epin", "exam_pin"].includes(transactionType)) return "peyflex";
  return null;
};

export const isSafeReconciliationNote = (evidenceReference, reason) => {
  const evidence = String(evidenceReference || "").trim();
  const note = String(reason || "").trim();
  const containsSensitiveContent = /bearer\s|api[_ -]?key|secret|password|authorization|\btoken\b|[{}]/i;
  return evidence.length > 0 && evidence.length <= 200 && note.length > 0 && note.length <= 500 &&
    !containsSensitiveContent.test(evidence) && !containsSensitiveContent.test(note);
};