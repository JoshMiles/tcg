// The Cheesy TCG icon. Used wherever the app shows its logo (admin sidebar, login, empty states, pack previews).
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <img
      src="/brand/icon-small.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className="rounded-xl object-cover"
      style={{ width: size, height: size }}
    />
  );
}
