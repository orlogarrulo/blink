import { useEffect, useState } from "react";
import { BASE_CUPS, CUPS, type Cup } from "@/lib/catalog";
import { catalogSettings, loadCatalog, updateCatalog, useCatalogVersion } from "@/lib/catalog-store";
import { formatKz, getKzPerEur } from "@/lib/money";

const control = "min-h-11 w-full min-w-0 rounded-2xl border border-line bg-paper px-3 text-sm";

function eurOf(row: { kz: number; eur?: number }) {
  return row.eur ?? row.kz / getKzPerEur();
}

/** Management page: item names, new items, euro prices and the EUR → Kz rate (saved on this device). */
export function GestaoPage() {
  useCatalogVersion();
  const [ready, setReady] = useState(false);
  const [rateText, setRateText] = useState("");
  const [newName, setNewName] = useState("");
  const [newBase, setNewBase] = useState("ECO40");

  useEffect(() => {
    loadCatalog();
    setRateText(String(catalogSettings().rate));
    setReady(true);
    document.title = "BLINK — gestão";
  }, []);

  const rate = getKzPerEur();

  function setRate(text: string) {
    setRateText(text);
    const value = Number(text.replace(",", "."));
    if (Number.isFinite(value) && value > 0) updateCatalog((draft) => ({ ...draft, rate: value }));
  }

  function rename(cup: Cup, name: string) {
    updateCatalog((draft) => {
      if (cup.custom) {
        draft.added = draft.added.map((item) => (item.id === cup.id ? { ...item, name } : item));
      } else {
        draft.edits[cup.id] = { ...(draft.edits[cup.id] ?? {}), name };
      }
      return draft;
    });
  }

  function setPrice(cup: Cup, index: number, text: string) {
    if (!text.trim()) return;
    const eur = Number(text.replace(",", "."));
    if (!Number.isFinite(eur) || eur < 0) return;
    updateCatalog((draft) => {
      const rows = cup.prices.map((row, i) => ({ qty: row.qty, eur: i === index ? eur : eurOf(row) }));
      if (cup.custom) draft.added = draft.added.map((item) => (item.id === cup.id ? { ...item, prices: rows.map((row) => ({ ...row, kz: 0 })) } : item));
      else draft.edits[cup.id] = { ...(draft.edits[cup.id] ?? {}), prices: rows };
      return draft;
    });
  }

  function setQty(cup: Cup, index: number, text: string) {
    const qty = Math.round(Number(text));
    if (!Number.isFinite(qty) || qty < 1) return;
    updateCatalog((draft) => {
      const rows = cup.prices.map((row, i) => ({ qty: i === index ? qty : row.qty, eur: eurOf(row) }));
      if (cup.custom) draft.added = draft.added.map((item) => (item.id === cup.id ? { ...item, prices: rows.map((row) => ({ ...row, kz: 0 })) } : item));
      else draft.edits[cup.id] = { ...(draft.edits[cup.id] ?? {}), prices: rows };
      return draft;
    });
  }

  function setSize(cup: Cup, key: "height" | "top" | "bot" | "cl", text: string) {
    const value = Number(text.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) return;
    updateCatalog((draft) => {
      draft.added = draft.added.map((item) => (item.id === cup.id ? { ...item, [key]: value, ...(key === "cl" ? { useful: value } : {}) } : item));
      return draft;
    });
  }

  function setWindow(cup: Cup, key: "iml" | "screen", side: "w" | "h", text: string) {
    const value = Number(text.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) return;
    updateCatalog((draft) => {
      draft.added = draft.added.map((item) => (item.id === cup.id ? { ...item, [key]: { ...(item[key] ?? { w: 100, h: 50 }), [side]: value } } : item));
      return draft;
    });
  }

  function addItem() {
    const name = newName.trim();
    if (!name) return;
    const base = CUPS.find((cup) => cup.id === newBase) ?? BASE_CUPS[0];
    const used = new Set(CUPS.map((cup) => cup.id));
    let n = 1;
    while (used.has(`NOVO${n}`)) n += 1;
    const item: Cup = {
      ...base,
      id: `NOVO${n}`,
      name: name.slice(0, 40),
      custom: true,
      prices: base.prices.map((row) => ({ qty: row.qty, eur: eurOf(row), kz: 0 })),
    };
    updateCatalog((draft) => ({ ...draft, added: [...draft.added, item] }));
    setNewName("");
  }

  function removeItem(cup: Cup) {
    updateCatalog((draft) => {
      draft.added = draft.added.filter((item) => item.id !== cup.id);
      delete draft.edits[cup.id];
      return draft;
    });
  }

  function resetItem(cup: Cup) {
    updateCatalog((draft) => {
      delete draft.edits[cup.id];
      return draft;
    });
  }

  if (!ready) return <main className="mx-auto min-h-dvh w-full max-w-3xl px-4 py-6" />;

  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl overflow-x-hidden px-4 pb-[max(4rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-3xl">Gestão</h1>
        <a href="/" className="min-h-11 py-3 text-sm underline underline-offset-4">Voltar ao estúdio</a>
      </header>
      <p className="mt-1 text-sm text-muted">Nomes, novos itens, preços e câmbio. Fica guardado neste aparelho e o estúdio atualiza logo.</p>

      <section className="mt-6 rounded-3xl border border-line bg-card p-4">
        <h2 className="font-display text-xl">Câmbio</h2>
        <label className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span>1 € =</span>
          <input className={`${control} w-32`} inputMode="decimal" value={rateText} onChange={(event) => setRate(event.target.value)} aria-label="Kwanzas por euro" />
          <span>Kz</span>
        </label>
        <p className="mt-2 text-xs text-muted">Os preços guardam-se em euros. Os valores em kwanzas são euro × câmbio e mudam no momento em todo o estúdio, nas fichas e no PDF. Valor de origem: 1 € = 1 147 Kz.</p>
      </section>

      <section className="mt-6 rounded-3xl border border-line bg-card p-4">
        <h2 className="font-display text-xl">Novo item</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,12rem)_auto]">
          <input className={control} value={newName} maxLength={40} placeholder="Nome do item" onChange={(event) => setNewName(event.target.value)} />
          <label className="text-xs text-muted">
            <span className="sr-only">Baseado em</span>
            <select className={control} value={newBase} onChange={(event) => setNewBase(event.target.value)} aria-label="Medidas e preços de partida">
              {CUPS.map((cup) => (
                <option key={cup.id} value={cup.id}>Como {cup.name}</option>
              ))}
            </select>
          </label>
          <button type="button" className="min-h-11 rounded-full bg-ink px-5 text-sm text-paper disabled:opacity-40" disabled={!newName.trim()} onClick={addItem}>Lançar</button>
        </div>
        <p className="mt-2 text-xs text-muted">O novo item começa com as medidas e os preços do modelo escolhido; depois acerta-os em baixo.</p>
      </section>

      <ul className="mt-6 space-y-4">
        {CUPS.map((cup) => (
          <li key={`${cup.id}-${catalogSettings().edits[cup.id] ? "e" : "b"}`} className="rounded-3xl border border-line bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <input className={`${control} flex-1 font-medium`} value={cup.name} maxLength={40} aria-label={`Nome de ${cup.id}`} onChange={(event) => rename(cup, event.target.value)} />
              {cup.custom ? (
                <button type="button" className="min-h-11 px-3 text-sm text-pitanga" onClick={() => removeItem(cup)}>Apagar</button>
              ) : catalogSettings().edits[cup.id] ? (
                <button type="button" className="min-h-11 px-3 text-sm" onClick={() => resetItem(cup)}>Repor</button>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-muted">
              {cup.id} · {cup.cl} cl · {cup.height} × boca {cup.top} × base {cup.bot} mm
              {cup.iml ? ` · IML ${cup.iml.w} × ${cup.iml.h} mm` : ""}
              {cup.screen ? ` · serigrafia ${cup.screen.w} × ${cup.screen.h} mm` : ""}
            </p>
            {cup.custom ? (
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([["cl", "Capacidade (cl)", cup.cl], ["height", "Altura (mm)", cup.height], ["top", "Boca Ø (mm)", cup.top], ["bot", "Base Ø (mm)", cup.bot]] as const).map(([key, label, value]) => (
                  <label key={key} className="text-xs text-muted">
                    {label}
                    <input className={`${control} mt-1`} inputMode="decimal" defaultValue={value} onBlur={(event) => setSize(cup, key, event.target.value)} />
                  </label>
                ))}
                {([["iml", "w", "IML largura"], ["iml", "h", "IML altura"], ["screen", "w", "Serigrafia largura"], ["screen", "h", "Serigrafia altura"]] as const).map(([key, side, label]) => (
                  <label key={`${key}-${side}`} className="text-xs text-muted">
                    {label} (mm)
                    <input className={`${control} mt-1`} inputMode="decimal" defaultValue={cup[key]?.[side] ?? ""} onBlur={(event) => setWindow(cup, key, side, event.target.value)} />
                  </label>
                ))}
              </div>
            ) : null}
            <table className="mt-3 w-full table-fixed text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="w-[30%] pb-1 font-normal">A partir de</th>
                  <th className="w-[35%] pb-1 font-normal">€ / un</th>
                  <th className="w-[35%] pb-1 text-right font-normal">Kz / un</th>
                </tr>
              </thead>
              <tbody>
                {cup.prices.map((row, index) => (
                  <tr key={`${cup.id}-${index}`}>
                    <td className="py-1 pr-2">
                      <input className={control} inputMode="numeric" defaultValue={row.qty} aria-label="Quantidade mínima" onBlur={(event) => setQty(cup, index, event.target.value)} />
                    </td>
                    <td className="py-1 pr-2">
                      <input className={control} inputMode="decimal" defaultValue={eurOf(row).toFixed(4).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",")} aria-label={`Preço em euros, ${row.qty} copos`} onChange={(event) => setPrice(cup, index, event.target.value)} />
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {formatKz(eurOf(row) * rate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </li>
        ))}
      </ul>
      <footer className="mt-16 text-center text-sm text-muted">© BLINK 2026</footer>
    </main>
  );
}
