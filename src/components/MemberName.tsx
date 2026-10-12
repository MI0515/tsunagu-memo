import type { Member } from "@/lib/types";

// メンバーの見分け方：色だけに頼らず、絵文字と表示名を必ず並べる
export function MemberName({ member }: { member: Member | undefined }) {
  if (!member || member.left_at || !member.color) {
    return <span style={{ color: "var(--member-left)" }}>退出したメンバー</span>;
  }
  return (
    <span className="font-bold" style={{ color: `var(--member-${member.color})` }}>
      <span aria-hidden>{member.emoji} </span>
      {member.display_name}
    </span>
  );
}
