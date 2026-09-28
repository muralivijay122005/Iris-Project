import { IrisMark } from "./ui/brand";

// Full-screen placeholder while the app or session loads
export default function Splash() {
  return (
    <div className="flex h-dvh items-center justify-center bg-bg">
      <span className="flex h-11 w-11 animate-pulse items-center justify-center rounded-2xl bg-accent text-accent-fg">
        <IrisMark size={20} />
      </span>
    </div>
  );
}
