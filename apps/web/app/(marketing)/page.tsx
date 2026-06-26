import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { modules, site, valueProps } from "@/lib/site";

// Title + description are inherited from the root layout's defaults (this is the home page).
export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section
        id="platform"
        className="border-b border-gray-200 bg-gradient-to-b from-brand-50 to-white"
      >
        <Container className="py-20 md:py-28">
          <div className="max-w-2xl">
            <span className="inline-flex rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-semibold text-brand-700">
              Multi-tenant global payroll
            </span>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-gray-900 md:text-5xl">
              {site.tagline}
            </h1>
            <p className="mt-5 text-lg text-gray-600">{site.description}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/#modules" variant="primary">
                Book a demo
              </ButtonLink>
              <ButtonLink href="/#platform" variant="secondary">
                Take a tour
              </ButtonLink>
            </div>
          </div>
        </Container>
      </section>

      {/* Modules */}
      <section id="modules" className="py-20">
        <Container>
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900">
              One platform, four modules
            </h2>
            <p className="mt-3 text-gray-600">
              From running a cycle to answering an employee&apos;s question, every part of payroll,
              in one place.
            </p>
          </div>
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {modules.map((module) => (
              <li
                key={module.key}
                data-testid={`module-${module.key}`}
                className="rounded-card border border-gray-200 bg-white p-6 shadow-card"
              >
                <h3 className="text-lg font-semibold text-gray-900">{module.name}</h3>
                <p className="mt-2 text-sm text-gray-600">{module.summary}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* Why Payce */}
      <section id="why" className="border-t border-gray-200 bg-gray-50 py-20">
        <Container>
          <div className="max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900">
              Security and tenancy aren&apos;t optional
            </h2>
            <p className="mt-3 text-gray-600">
              Payroll handles the most sensitive data a company holds. Payce is built to protect it.
            </p>
          </div>
          <dl className="mt-10 grid gap-6 md:grid-cols-3">
            {valueProps.map((prop) => (
              <div key={prop.title} className="rounded-card border border-gray-200 bg-white p-6">
                <dt className="text-base font-semibold text-gray-900">{prop.title}</dt>
                <dd className="mt-2 text-sm text-gray-600">{prop.body}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      {/* CTA */}
      <section id="resources" className="py-20">
        <Container>
          <div className="rounded-card bg-brand-600 px-8 py-12 text-center md:px-16">
            <h2 className="text-3xl font-bold tracking-tight text-white">
              See Payce run a payroll cycle
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-brand-100">
              Explore the platform with synthetic data: no signup, no real PII.
            </p>
            <div className="mt-8 flex justify-center">
              <ButtonLink href="/#platform" variant="secondary">
                Take a tour
              </ButtonLink>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
