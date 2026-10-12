"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Alert, Button, Card, ConfirmSheet, Field, LinkButton, Loading, PageTitle, Phrases, Sheet } from "@/components/ui";
import { MemberName } from "@/components/MemberName";
import { useRoom } from "@/components/rooms";
import {
  deleteRoom, leaveRoom, listMembers, removeMember, renameRoom, setMemberLook, transferOwner, updateDisplayName,
} from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { tapFeedback } from "@/lib/feedback";
import type { Member } from "@/lib/types";
import { collect, fileName, saveFile, toCsv } from "@/lib/export";
import { useRealtime } from "@/lib/useRealtime";

// 選べる絵文字（ハートや☀️🌙⭐など、アプリの中で別の意味を持つものは入れない）
const EMOJIS = ["🐻", "🐰", "🐱", "🐶", "🐼", "🦊", "🐨", "🐯", "🦁", "🐸", "🐧", "🐤", "🦉", "🐢", "🐳", "🐬", "🦋", "🌷", "🌻", "🍀", "🌈", "🍎", "🍙", "☕"];
const COLOR_NAMES = ["青", "オレンジ", "青緑", "ローズ", "紫", "黄緑"];

type Panel =
  | { kind: "name" }
  | { kind: "look" }
  | { kind: "room-name" }
  | { kind: "remove"; member: Member }
  | { kind: "transfer"; member: Member }
  | { kind: "leave" }
  | { kind: "delete-room" }
  | null;

export default function SettingsPage() {
  const { room, myId, reloadRooms } = useRoom();
  const router = useRouter();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>(null);

  const load = useCallback(async () => {
    try {
      setMembers(await listMembers(room.id));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [room.id]);

  useEffect(() => {
    setMembers(null);
    load();
  }, [load]);

  useRealtime(room.id, ["room_members"], load);

  const me = members?.find((m) => m.user_id === myId);
  const isOwner = room.role === "owner";
  const others = (members ?? []).filter((m) => m.user_id !== myId);
  const close = () => setPanel(null);
  const changed = () => {
    load();
    reloadRooms();
  };
  // 退出・削除のあとは、残っているルームか、はじめの画面へ
  const gone = async () => {
    await reloadRooms();
    router.replace("/");
  };

  return (
    <>
      <PageTitle>設定</PageTitle>
      {error && <Alert>{error}</Alert>}

      {!members || !me ? (
        <Loading />
      ) : (
        <>
          <Section title="あなた（このルームでの見え方）">
            <Row label="表示名" value={<MemberName member={me} />} onEdit={() => setPanel({ kind: "name" })} />
            <Row
              label="色と絵文字"
              value={
                <span className="flex items-center gap-2">
                  <span className="h-5 w-5 rounded-full" style={{ background: `var(--member-${me.color})` }} />
                  {COLOR_NAMES[(me.color ?? 1) - 1]}・{me.emoji}
                </span>
              }
              onEdit={() => setPanel({ kind: "look" })}
            />
          </Section>

          <Section title="ルーム">
            <Row label="ルームの名前" value={room.name} onEdit={isOwner ? () => setPanel({ kind: "room-name" }) : undefined} />
            {isOwner && <LinkButton href={`/invite/${room.id}`} variant="soft">招待リンク</LinkButton>}
          </Section>

          <Section title={`メンバー（${members.length}人）`}>
            <ul className="flex flex-col gap-2">
              {members.map((m) => (
                <li key={m.user_id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl bg-bg px-3 py-2">
                  <span className="min-w-0">
                    <MemberName member={m} />
                    {m.role === "owner" && <span className="ml-2 whitespace-nowrap text-sm text-muted">作成者</span>}
                    {m.user_id === myId && <span className="ml-1 whitespace-nowrap text-sm text-muted">（あなた）</span>}
                  </span>
                  {isOwner && m.user_id !== myId && (
                    <span className="ml-auto flex gap-1">
                      <SmallButton onClick={() => setPanel({ kind: "transfer", member: m })}>作成者を譲る</SmallButton>
                      <SmallButton onClick={() => setPanel({ kind: "remove", member: m })}>外す</SmallButton>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Section>

          <ExportSection room={room} />

          <Section title="ルームから離れる">
            {isOwner && others.length > 0 ? (
              <p className="text-sm text-muted"><Phrases text="作成者が退出する前に、メンバーのだれかに「作成者を譲る」をしてください。" /></p>
            ) : isOwner ? (
              <p className="text-sm text-muted"><Phrases text="メンバーがあなただけなので、ルームを終える時は下の「ルームを削除」を使ってください。" /></p>
            ) : (
              <Button variant="soft" onClick={() => setPanel({ kind: "leave" })}>ルームから退出</Button>
            )}
            {isOwner && (
              <Button variant="ghost" onClick={() => setPanel({ kind: "delete-room" })}>ルームを削除</Button>
            )}
          </Section>

          <Link href="/notice" className="text-center text-primary underline underline-offset-4">ご利用の前に（注意事項）</Link>
        </>
      )}

      {panel?.kind === "name" && me && (
        <TextSheet
          title="表示名を変える"
          label="表示名"
          maxLength={20}
          initial={me.display_name}
          onSave={(v) => updateDisplayName(room.id, v)}
          onClose={close}
          onDone={changed}
        />
      )}
      {panel?.kind === "room-name" && (
        <TextSheet
          title="ルームの名前を変える"
          label="ルームの名前"
          maxLength={30}
          initial={room.name}
          onSave={(v) => renameRoom(room.id, v)}
          onClose={close}
          onDone={changed}
        />
      )}
      {panel?.kind === "look" && me && members && (
        <LookSheet roomId={room.id} me={me} members={members} onClose={close} onDone={changed} />
      )}
      {panel?.kind === "remove" && (
        <ActionSheet
          title="メンバーを外す"
          message={
            <p>
              <MemberName member={panel.member} /> をルームから外します。これまでの記録は残り、名前は「退出したメンバー」と表示されます。
            </p>
          }
          confirmLabel="外す"
          action={() => removeMember(room.id, panel.member.user_id)}
          onClose={close}
          onDone={changed}
        />
      )}
      {panel?.kind === "transfer" && (
        <ActionSheet
          title="作成者を譲る"
          message={
            <p>
              <MemberName member={panel.member} /> を、このルームの作成者にします。あなたは普通のメンバーになり、メンバーを外す・ルームを削除することはできなくなります。
            </p>
          }
          confirmLabel="譲る"
          action={() => transferOwner(room.id, panel.member.user_id)}
          onClose={close}
          onDone={changed}
        />
      )}
      {panel?.kind === "leave" && <LeaveSheet roomId={room.id} onClose={close} onDone={gone} />}
      {panel?.kind === "delete-room" && <DeleteRoomSheet roomId={room.id} roomName={room.name} onClose={close} onDone={gone} />}
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-[1.0625rem] font-bold">{title}</h2>
      {children}
    </Card>
  );
}

function Row({ label, value, onEdit }: { label: string; value: ReactNode; onEdit?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm text-muted">{label}</p>
        <div className="min-w-0">{value}</div>
      </div>
      {onEdit && <SmallButton onClick={onEdit}>変える</SmallButton>}
    </div>
  );
}

function SmallButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={() => {
        tapFeedback();
        onClick();
      }}
      className="min-h-11 shrink-0 whitespace-nowrap rounded-full border-2 border-border px-3 text-sm font-bold text-primary active:scale-95"
    >
      {children}
    </button>
  );
}

function TextSheet({ title, label, maxLength, initial, onSave, onClose, onDone }: {
  title: string;
  label: string;
  maxLength: number;
  initial: string;
  onSave: (value: string) => Promise<unknown>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave(value.trim());
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Sheet title={title} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field id="settings-text" label={label} maxLength={maxLength} value={value} onChange={(e) => setValue(e.target.value)} autoFocus required />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy} disabled={!value.trim() || value.trim() === initial}>保存する</Button>
      </form>
    </Sheet>
  );
}

// 色と絵文字を選ぶ。ほかのメンバーが使っている色は選べない
function LookSheet({ roomId, me, members, onClose, onDone }: {
  roomId: string;
  me: Member;
  members: Member[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [color, setColor] = useState(me.color ?? 1);
  const [emoji, setEmoji] = useState(me.emoji ?? EMOJIS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const takenBy = new Map(members.filter((m) => m.user_id !== me.user_id && m.color).map((m) => [m.color!, m]));
  const preview: Member = { ...me, color, emoji };

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await setMemberLook(roomId, color, emoji);
      onDone();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Sheet title="色と絵文字を変える" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="rounded-2xl bg-surface p-3">
          <MemberName member={preview} />
        </p>

        <fieldset>
          <legend className="mb-2 font-bold">色</legend>
          <div className="grid grid-cols-3 gap-2">
            {COLOR_NAMES.map((name, i) => {
              const n = i + 1;
              const owner = takenBy.get(n);
              const selected = color === n;
              return (
                <button
                  key={n}
                  type="button"
                  disabled={!!owner}
                  onClick={() => {
                    tapFeedback();
                    setColor(n);
                  }}
                  aria-pressed={selected}
                  className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl border-2 px-2 py-2 text-sm transition-colors active:scale-95 disabled:opacity-60 ${
                    selected ? "border-primary bg-primary-soft font-bold" : "border-border"
                  }`}
                >
                  <span className="h-6 w-6 rounded-full" style={{ background: `var(--member-${n})` }} />
                  <span>{name}</span>
                  {owner && <span className="text-xs text-muted">{owner.emoji}が使用中</span>}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 font-bold">絵文字</legend>
          <div className="grid grid-cols-6 gap-2">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  tapFeedback();
                  setEmoji(e);
                }}
                aria-pressed={emoji === e}
                className={`flex min-h-12 items-center justify-center rounded-2xl border-2 text-2xl active:scale-95 ${
                  emoji === e ? "border-primary bg-primary-soft" : "border-transparent"
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </fieldset>

        {error && <Alert>{error}</Alert>}
        <Button onClick={save} loading={busy} disabled={color === me.color && emoji === me.emoji}>保存する</Button>
      </div>
    </Sheet>
  );
}

function ActionSheet({ title, message, confirmLabel, action, onClose, onDone }: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  action: () => Promise<unknown>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <ConfirmSheet
      title={title}
      message={message}
      confirmLabel={confirmLabel}
      busy={busy}
      error={error}
      onConfirm={async () => {
        setBusy(true);
        setError(null);
        try {
          await action();
          onDone();
          onClose();
        } catch (e) {
          setError(errorMessage(e));
          setBusy(false);
        }
      }}
      onCancel={onClose}
    />
  );
}

// 退出：記録を残すか、自分の分を全部削除するかを選んでから、確認する
function LeaveSheet({ roomId, onClose, onDone }: { roomId: string; onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<"keep" | "erase" | null>(null);

  if (mode) {
    return (
      <ActionSheet
        title="ルームから退出"
        message={
          mode === "keep" ? (
            <p>退出します。あなたのスタンプ・振り返り・追記は残り、名前は「退出したメンバー」と表示されます。</p>
          ) : (
            <p>退出します。あなたのスタンプ・振り返り・追記をすべて削除します。あなたの振り返りについていた、ほかの人の追記も消えます。元には戻せません。</p>
          )
        }
        confirmLabel="退出する"
        action={() => leaveRoom(roomId, mode)}
        onClose={() => setMode(null)}
        onDone={onDone}
      />
    );
  }

  return (
    <Sheet title="ルームから退出" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p>退出したあと、あなたの記録をどうしますか？</p>
        <button
          onClick={() => {
            tapFeedback();
            setMode("keep");
          }}
          className="rounded-2xl border-2 border-border p-4 text-left active:scale-[0.98]"
        >
          <span className="block font-bold">記録を残す</span>
          <span className="text-sm text-muted">スタンプや振り返りは残り、名前は「退出したメンバー」になります</span>
        </button>
        <button
          onClick={() => {
            tapFeedback();
            setMode("erase");
          }}
          className="rounded-2xl border-2 border-border p-4 text-left active:scale-[0.98]"
        >
          <span className="block font-bold">自分の分を全部削除する</span>
          <span className="text-sm text-muted">あなたのスタンプ・振り返り・追記をすべて消します</span>
        </button>
        <Button variant="soft" onClick={onClose}>キャンセル</Button>
      </div>
    </Sheet>
  );
}

// ルームの削除：ルーム名を入力して、一致した時だけ削除できる
function DeleteRoomSheet({ roomId, roomName, onClose, onDone }: {
  roomId: string;
  roomName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim() === roomName;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await deleteRoom(roomId, typed.trim());
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Sheet title="ルームを削除" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p>
          ルーム「{roomName}」と、その中のメモ・確認リスト・スタンプ・振り返り・お気に入りを、すべて削除します。
          メンバー全員が使えなくなり、元には戻せません。
        </p>
        <p className="text-sm text-muted"><Phrases text="大切な記録は、先に設定の「記録の書き出し」で保存しておくと安心です。" /></p>
        <Field
          id="confirm-room-name"
          label="確認のため、ルームの名前を入力してください"
          hint={`「${roomName}」と入力`}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
        />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy} disabled={!matches}>削除</Button>
        <Button type="button" variant="soft" onClick={onClose}>キャンセル</Button>
      </form>
    </Sheet>
  );
}

// 記録の書き出し。JSON（復元用）と CSV（Excel用）
function ExportSection({ room }: { room: { id: string; name: string } }) {
  const [busy, setBusy] = useState<"json" | "csv" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: "json" | "csv") {
    setBusy(kind);
    setMessage(null);
    setError(null);
    try {
      const data = await collect(room);
      const result =
        kind === "json"
          ? await saveFile(fileName(room.name, "json"), JSON.stringify(data, null, 2), "application/json")
          : await saveFile(fileName(room.name, "csv"), toCsv(data), "text/csv");
      if (result !== "cancelled") {
        const entries = data.days.reduce((n, d) => n + d.entries.length, 0);
        const reflections = data.days.reduce((n, d) => n + d.reflections.length, 0);
        setMessage(`${data.days.length}日分（確認リスト${entries}件・振り返り${reflections}件）を保存しました。`);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Section title="記録の書き出し">
      <p className="text-sm text-muted">
        無料で運用しているため、自動のバックアップはありません。大切な記録は、月に1回くらい保存しておくと安心です。
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="soft" className="whitespace-nowrap" onClick={() => run("json")} loading={busy === "json"} disabled={busy !== null}>
          JSONで保存
        </Button>
        <Button variant="soft" className="whitespace-nowrap" onClick={() => run("csv")} loading={busy === "csv"} disabled={busy !== null}>
          CSVで保存
        </Button>
      </div>
      <p className="text-xs text-muted">
        JSONは復元用、CSVはExcelなどで読む用です。iPhoneでは、共有メニューから「ファイルに保存」を選んでください。
      </p>
      {message && <p className="rounded-2xl bg-primary-soft px-3 py-2 text-sm"><Phrases text={message} /></p>}
      {error && <Alert>{error}</Alert>}
    </Section>
  );
}
