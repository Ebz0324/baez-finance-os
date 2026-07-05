export function Stub({ title, arrives }: { title: string; arrives: string }) {
  return (
    <div className="px-6 pt-16 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-zinc-400">Arrives in {arrives}.</p>
    </div>
  );
}
