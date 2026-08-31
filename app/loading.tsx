export default function Loading() {
  return (
    <main className="min-h-dvh bg-[#f7f8fa] p-6 md:p-10">
      <div className="mx-auto max-w-6xl animate-pulse">
        <div className="h-10 w-32 rounded-lg bg-[#e2e8f0]" />
        <div className="mt-20 h-12 max-w-xl rounded-lg bg-[#e2e8f0]" />
        <div className="mt-4 h-5 max-w-lg rounded bg-[#e2e8f0]" />
        <div className="mt-8 h-11 w-36 rounded-lg bg-[#d7eee0]" />
      </div>
    </main>
  );
}
