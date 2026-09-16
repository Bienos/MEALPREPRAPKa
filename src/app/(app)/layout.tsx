import { TabBar } from "@/components/shell/tab-bar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
      <main className="flex flex-1 flex-col gap-6 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-28">
        {children}
      </main>
      <TabBar />
    </div>
  );
}
