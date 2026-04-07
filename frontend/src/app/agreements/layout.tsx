import AgreementsSidebar from "@/components/ui/AgreementsSidebar";

export default function AgreementsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full bg-white">
      <AgreementsSidebar />
      <div className="flex-1 overflow-y-auto p-8">{children}</div>
    </div>
  );
}
