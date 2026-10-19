import { NativeSelect } from "@/components/native-select";
import { CONTACT_CHANNELS, CONTACT_CHANNEL_LABELS, type ContactChannelCode } from "@/modules/purchase-orders/labels";

/** Moyen de contact avec le fournisseur (envoi, relance). */
export function ChannelSelect({
  id,
  value,
  onChange,
  testId,
}: {
  id: string;
  value: ContactChannelCode | "";
  onChange: (v: ContactChannelCode | "") => void;
  testId: string;
}) {
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value as ContactChannelCode | "")} data-testid={testId}>
      <option value="">Choisir le moyen…</option>
      {CONTACT_CHANNELS.map((c) => (
        <option key={c} value={c}>
          {CONTACT_CHANNEL_LABELS[c]}
        </option>
      ))}
    </NativeSelect>
  );
}
