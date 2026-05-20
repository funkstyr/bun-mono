import { useCallback, useId, useState, type ChangeEvent, type FormEvent, type JSX } from "react";

import { Button } from "@bun-mono/core-ui/button";
import { Input } from "@bun-mono/core-ui/input";

import { ALL_SEATS, type Seat } from "../engine";
import { STRATEGIES, type StrategyName } from "../strategy";
import { runBatch, type RoleDistribution } from "./run-batch";

const STRATEGY_NAMES = Object.keys(STRATEGIES) as StrategyName[];
const DEFAULT_STRATEGIES: Record<Seat, StrategyName> = {
  0: "hard",
  1: "hard",
  2: "hard",
  3: "hard",
};

export function SimPanel(): JSX.Element {
  const [strategies, setStrategies] = useState<Record<Seat, StrategyName>>(DEFAULT_STRATEGIES);
  const [n, setN] = useState(100);
  const [seedInput, setSeedInput] = useState("");
  const [result, setResult] = useState<RoleDistribution | null>(null);

  const onRun = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = seedInput.trim();
      const args = trimmed === "" ? { strategies, n } : { strategies, n, seed: Number(trimmed) };
      setResult(runBatch(args));
    },
    [strategies, n, seedInput],
  );

  const onNChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setN(Math.max(1, Number(e.target.value) || 1));
  }, []);

  const onSeedChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setSeedInput(e.target.value);
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold">Royalty — Sim</h1>
        <p className="text-muted-foreground text-xs">
          Dev-only batch runner. Reachable via <code>?sim=1</code>.
        </p>
      </header>

      <form className="flex flex-col gap-4" onSubmit={onRun}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ALL_SEATS.map((seat) => (
            <StrategySelect
              key={seat}
              seat={seat}
              value={strategies[seat]}
              onChange={setStrategies}
            />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <LabeledInput label="N (games)">
            <Input type="number" min={1} value={n} onChange={onNChange} />
          </LabeledInput>
          <LabeledInput label="Seed (blank = random)">
            <Input type="text" inputMode="numeric" value={seedInput} onChange={onSeedChange} />
          </LabeledInput>
        </div>

        <div>
          <Button type="submit" size="sm">
            Run
          </Button>
        </div>
      </form>

      {result === null ? null : <ResultsTable result={result} strategies={strategies} />}
    </div>
  );
}

function LabeledInput({ label, children }: { label: string; children: JSX.Element }): JSX.Element {
  const id = useId();
  const child: JSX.Element = { ...children, props: { ...children.props, id } };
  return (
    <div className="flex flex-col gap-1 text-xs">
      <label htmlFor={id} className="text-muted-foreground">
        {label}
      </label>
      {child}
    </div>
  );
}

function StrategySelect({
  seat,
  value,
  onChange,
}: {
  seat: Seat;
  value: StrategyName;
  onChange: (updater: (prev: Record<Seat, StrategyName>) => Record<Seat, StrategyName>) => void;
}): JSX.Element {
  const id = useId();
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const next = e.target.value as StrategyName;
      onChange((prev) => ({ ...prev, [seat]: next }));
    },
    [seat, onChange],
  );
  return (
    <div className="flex flex-col gap-1 text-xs">
      <label htmlFor={id} className="text-muted-foreground">
        Seat {seat}
      </label>
      <select
        id={id}
        className="border-input h-8 rounded-none border bg-transparent px-2.5 py-1 text-xs"
        value={value}
        onChange={handleChange}
      >
        {STRATEGY_NAMES.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
}

function ResultsTable({
  result,
  strategies,
}: {
  result: RoleDistribution;
  strategies: Record<Seat, StrategyName>;
}): JSX.Element {
  return (
    <table className="w-full text-left text-xs">
      <thead className="text-muted-foreground">
        <tr>
          <th className="py-1 pr-3 font-normal">Seat</th>
          <th className="py-1 pr-3 font-normal">Strategy</th>
          <th className="py-1 pr-3 font-normal">King %</th>
          <th className="py-1 pr-3 font-normal">Queen %</th>
          <th className="py-1 pr-3 font-normal">3rd %</th>
          <th className="py-1 pr-3 font-normal">Joker %</th>
        </tr>
      </thead>
      <tbody>
        {ALL_SEATS.map((seat) => (
          <tr key={seat} className="border-input border-t">
            <td className="py-1 pr-3">{seat}</td>
            <td className="py-1 pr-3">{strategies[seat]}</td>
            <td className="py-1 pr-3">{result[seat].king.toFixed(1)}</td>
            <td className="py-1 pr-3">{result[seat].queen.toFixed(1)}</td>
            <td className="py-1 pr-3">{result[seat].third.toFixed(1)}</td>
            <td className="py-1 pr-3">{result[seat].joker.toFixed(1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
