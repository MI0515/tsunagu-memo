"use client";

import { useState, type FormEvent } from "react";
import { Alert, Button, Field, Sheet } from "@/components/ui";
import { removeItem, renameItem } from "@/lib/api";
import { formatTime } from "@/lib/date";
import { errorMessage } from "@/lib/errors";
import { STAMPS, type Item, type Stamp } from "@/lib/types";
import { repeatLabel } from "./ItemCard";

type Props = {
  item: Item;
  stamps: Stamp[];
  names: Map<string, string>;
  onClose: () => void;
  onChanged: () => void;
};

// 項目をタップした時：だれがいつ押したか、名前の変更、削除
export function ItemDetailSheet({ item, stamps, names, onClose, onChanged }: Props) {
  const [title, setTitle] = useState(item.title);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const repeat = repeatLabel(item);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  function save(e: FormEvent) {
    e.preventDefault();
    run(() => renameItem(item.id, title.trim()));
  }

  return (
    <Sheet title="項目の詳しい内容" onClose={onClose}>
      <div className="flex flex-col gap-6">
        <section>
          <h3 className="mb-2 font-bold">スタンプ</h3>
          {stamps.length === 0 ? (
            <p className="text-muted">まだだれも押していません。</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {stamps.map((s) => (
                <li key={`${s.user_id}-${s.kind}`}>
                  {STAMPS.find((x) => x.kind === s.kind)?.emoji}{" "}
                  {names.get(s.user_id) ?? "退出したメンバー"}
                  <span className="text-muted">　{formatTime(s.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <form onSubmit={save} className="flex flex-col gap-3">
          <Field
            id="edit-title"
            label="やること"
            hint={repeat ?? "今日だけ"}
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <Button type="submit" variant="soft" loading={busy} disabled={!title.trim() || title.trim() === item.title}>
            名前を変える
          </Button>
        </form>

        {error && <Alert>{error}</Alert>}

        {confirming ? (
          <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
            <p>
              {repeat
                ? "今日から表示されなくなります。これまでの記録は、ふりかえりに残ります。"
                : "この項目と、押されたスタンプを消します。"}
            </p>
            <Button onClick={() => run(() => removeItem(item.id))} loading={busy}>消す</Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>やめる</Button>
          </div>
        ) : (
          <Button variant="ghost" onClick={() => setConfirming(true)}>この項目を消す</Button>
        )}
      </div>
    </Sheet>
  );
}
