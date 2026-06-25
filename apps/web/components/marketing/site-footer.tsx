import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Container } from "@/components/ui/container";
import { copyright, footerColumns, site } from "@/lib/site";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-gray-200 bg-gray-50">
      <Container className="grid gap-10 py-12 md:grid-cols-[1.5fr_repeat(3,1fr)]">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-3 text-sm text-gray-600">{site.description}</p>
        </div>
        {footerColumns.map((col) => (
          <div key={col.heading}>
            <h2 className="text-sm font-semibold text-gray-900">{col.heading}</h2>
            <ul className="mt-3 space-y-2">
              {col.links.map((link, i) => (
                <li key={`${link.label}-${i}`}>
                  <Link href={link.href} className="text-sm text-gray-600 hover:text-gray-900">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Container>
      <div className="border-t border-gray-200">
        <Container className="py-6">
          <p className="text-xs text-gray-500">{copyright(year)}</p>
        </Container>
      </div>
    </footer>
  );
}
