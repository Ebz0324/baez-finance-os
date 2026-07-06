import { useCategories, type Category } from "../../lib/queries";

type CategoryPickerProps = {
  kind: "expense" | "income";
  onPick: (category: Pick<Category, "id" | "name">) => void;
  onClose: () => void;
};

/** Full category list, grouped parent → children. Reached only via "Other…". */
export function CategoryPicker({ kind, onPick, onClose }: CategoryPickerProps) {
  const categoriesQuery = useCategories();
  const all = categoriesQuery.data ?? [];
  const parents = all.filter((c) => c.kind === kind && c.parentId === null);

  return (
    <div className="fixed inset-0 z-30 flex items-end bg-black/60" onClick={onClose}>
      <div
        className="max-h-[75vh] w-full overflow-y-auto rounded-t-2xl bg-zinc-900 p-5 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-medium">Pick a category</h2>
        <div className="mt-3 flex flex-col gap-4">
          {parents.map((parent) => {
            const children = all.filter((c) => c.parentId === parent.id);
            return (
              <div key={parent.id}>
                <button
                  type="button"
                  onClick={() => onPick(parent)}
                  className="text-sm font-medium text-zinc-200"
                >
                  {parent.name}
                </button>
                {children.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {children.map((child) => (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => onPick(child)}
                        className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300"
                      >
                        {child.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
