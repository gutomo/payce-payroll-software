import { formatMoney, formatNumber, type Locale } from "@payce/i18n";
import { GuidedTour } from "@/components/demo/guided-tour";
import { type Bar, toBars } from "@/lib/demo/chart";
import { DEMO_CURRENCY, demoCostByDept, demoHeadcountByDept, sumMetric } from "@/lib/demo/fixtures";
import { getTour } from "@/lib/demo/tours";

/** A static, synthetic Insights dashboard for the demo, annotated with `data-tour` targets. Counts
 *  and costs are localized for the active locale (cost as currency via formatMoney). */
export function DemoInsights({ locale }: { locale: Locale }) {
  const tour = getTour("insights");
  return (
    <div className="space-y-6">
      <header data-tour="dashboard">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Workforce overview</h1>
        <p className="mt-1 text-sm text-gray-500">
          {formatNumber(sumMetric(demoHeadcountByDept), locale)} people across{" "}
          {demoHeadcountByDept.length} departments
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <BarCard
          target="headcount"
          title="Headcount by department"
          bars={toBars(demoHeadcountByDept)}
          format={(value) => formatNumber(value, locale)}
        />
        <BarCard
          target="cost"
          title="Cost to company by department"
          bars={toBars(demoCostByDept)}
          format={(value) => formatMoney(value, DEMO_CURRENCY, locale)}
        />
      </div>

      <section
        data-tour="builder"
        className="rounded-card border border-gray-200 bg-white p-6 shadow-card"
      >
        <h2 className="text-sm font-semibold text-gray-900">No-code report builder</h2>
        <p className="mt-1 text-sm text-gray-500">
          Pick what to group by and what to measure — no SQL — then export or schedule it.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {["Group: Department", "Measure: Headcount", "Filter: Active", "Sort: High → low"].map(
            (chip) => (
              <span
                key={chip}
                className="rounded-full border border-gray-300 px-3 py-1 text-gray-600"
              >
                {chip}
              </span>
            ),
          )}
        </div>
      </section>

      {tour && <GuidedTour tour={tour} />}
    </div>
  );
}

function BarCard({
  target,
  title,
  bars,
  format,
}: {
  target: string;
  title: string;
  bars: Bar[];
  format: (value: number) => string;
}) {
  return (
    <section
      data-tour={target}
      className="rounded-card border border-gray-200 bg-white p-6 shadow-card"
    >
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      <ul className="mt-4 space-y-3">
        {bars.map((bar) => (
          <li key={bar.label} className="grid grid-cols-[8rem_1fr_3rem] items-center gap-3 text-sm">
            <span className="truncate text-gray-700">{bar.label}</span>
            <span className="h-3 rounded-full bg-gray-100">
              <span
                className="block h-3 rounded-full bg-brand-500"
                style={{ width: `${bar.pct}%` }}
              />
            </span>
            <span className="text-right font-medium text-gray-900">{format(bar.value)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
