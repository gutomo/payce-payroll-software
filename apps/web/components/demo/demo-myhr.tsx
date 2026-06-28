import { formatDate, formatDays, formatMoney, type Locale } from "@payce/i18n";
import { GuidedTour } from "@/components/demo/guided-tour";
import {
  DEMO_CURRENCY,
  demoEmployee,
  demoLeaveBalances,
  demoPayslip,
  demoTasks,
} from "@/lib/demo/fixtures";
import { getTour } from "@/lib/demo/tours";
import { getTranslator } from "@/lib/i18n/messages";

/** A static, synthetic MyHR (employee self-service) screen for the demo, annotated with `data-tour`
 *  targets the {@link GuidedTour} spotlights. No API calls; everything is fixture data. Money, dates,
 *  and counts are localized for the active locale (the multi-currency/locale showcase). */
export function DemoMyHr({ locale }: { locale: Locale }) {
  const tour = getTour("myhr");
  const t = getTranslator(locale);
  return (
    <div className="space-y-6">
      <header
        data-tour="welcome"
        className="rounded-card border border-gray-200 bg-white p-6 shadow-card"
      >
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Good morning, {demoEmployee.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {demoEmployee.jobTitle} · {demoEmployee.department} · {demoEmployee.employeeNumber}
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <section
          data-tour="payslip"
          className="rounded-card border border-gray-200 bg-white p-6 shadow-card"
        >
          <h2 className="text-sm font-semibold text-gray-900">{t("demo.payslip.latest")}</h2>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {formatMoney(demoPayslip.netMinor, DEMO_CURRENCY, locale)}
          </p>
          <p className="text-sm text-gray-500">
            {t("demo.payslip.net")} · {demoPayslip.period} ·{" "}
            {formatDate(demoPayslip.payDate, locale)}
          </p>
          <p className="mt-3 text-sm font-medium text-brand-700">Download PDF →</p>
        </section>

        <section
          data-tour="leave"
          className="rounded-card border border-gray-200 bg-white p-6 shadow-card"
        >
          <h2 className="text-sm font-semibold text-gray-900">{t("demo.leave.title")}</h2>
          <ul className="mt-3 space-y-3">
            {demoLeaveBalances.map((balance) => (
              <li key={balance.type}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-gray-700">{balance.type}</span>
                  <span className="font-semibold text-gray-900">
                    {formatDays(balance.remaining, locale)}{" "}
                    <span className="font-normal text-gray-500">{t("demo.leave.daysLeft")}</span>
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-gray-100">
                  <div
                    className="h-2 rounded-full bg-brand-500"
                    style={{
                      width: `${balance.entitled > 0 ? (balance.remaining / balance.entitled) * 100 : 0}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section
        data-tour="tasks"
        className="rounded-card border border-gray-200 bg-white p-6 shadow-card"
      >
        <h2 className="text-sm font-semibold text-gray-900">Your tasks</h2>
        <ul className="mt-3 space-y-2">
          {demoTasks.map((task) => (
            <li key={task} className="flex items-center gap-2 text-sm text-gray-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
              {task}
            </li>
          ))}
        </ul>
      </section>

      <section
        data-tour="assist"
        className="rounded-card border border-gray-200 bg-white p-4 shadow-card"
      >
        <p className="mb-2 text-sm font-semibold text-gray-900">Ask Assist</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-card border border-gray-300 px-3 py-2 text-sm text-gray-500">
            What&rsquo;s my leave balance?
          </div>
          <span className="rounded-card bg-brand-600 px-4 py-2 text-sm font-semibold text-white">
            Send
          </span>
        </div>
      </section>

      {tour && <GuidedTour tour={tour} />}
    </div>
  );
}
