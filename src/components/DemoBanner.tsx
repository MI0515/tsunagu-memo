import { IS_DEMO } from "@/lib/appMode";

// デモ環境の時だけ、画面のいちばん上に出す
export function DemoBanner() {
  if (!IS_DEMO) return null;
  return (
    <p className="rounded-full bg-alert-bg px-3 py-1 text-center text-xs text-alert-text">
      デモ版：データは毎日リセットされます。大切なことは書かないでください。
    </p>
  );
}
