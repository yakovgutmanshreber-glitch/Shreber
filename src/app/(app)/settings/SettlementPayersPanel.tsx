"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/client";
import { ListManager, type ListOption } from "@/components/ListManager";

// Manage the list of "עבר מי" payer names that mark a credit-card settlement deposit
// (e.g. ישראכרט). Income from the bank with such a payer is treated as the payout of
// Kesher charges already counted, so it's excluded from the dashboard income.
export function SettlementPayersPanel() {
  const [options, setOptions] = useState<ListOption[]>([]);
  const load = useCallback(async () => {
    setOptions(await api<ListOption[]>("/api/list-options"));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <ListManager
      title='שמות משלמים (כפי שמופיעים ב"עבר מי")'
      listKey="bankSettlement"
      items={options.filter((o) => o.listKey === "bankSettlement")}
      onChanged={load}
    />
  );
}
