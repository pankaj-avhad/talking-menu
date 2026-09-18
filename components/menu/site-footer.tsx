import type { MenuPage } from "@/lib/menu-view"

export function SiteFooter({ page }: { page: MenuPage }) {
  const { source, photoCredits, restaurant } = page
  const link = "underline underline-offset-4 hover:text-foreground"

  return (
    <footer className="mt-8 border-t bg-muted/40">
      <div className="mx-auto grid max-w-6xl gap-3 px-4 py-10 text-xs leading-relaxed text-muted-foreground sm:px-6">
        <p>
          Menu, prices and reviews from{" "}
          {source.storeUrl ? (
            <a
              href={source.storeUrl}
              target="_blank"
              rel="noreferrer"
              className={link}
            >
              {source.platform}
            </a>
          ) : (
            source.platform
          )}
          , captured {source.extractedOn}. {restaurant.disclaimers.join(" ")}
        </p>
        {photoCredits.length > 0 && (
          <p>
            Stock photos for dishes without their own photo by{" "}
            {photoCredits.map((credit, i) => (
              <span key={credit.photographerUrl}>
                {i > 0 && (i === photoCredits.length - 1 ? " and " : ", ")}
                <a
                  href={credit.photographerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={link}
                >
                  {credit.photographer}
                </a>
              </span>
            ))}{" "}
            on{" "}
            <a
              href="https://www.pexels.com"
              target="_blank"
              rel="noreferrer"
              className={link}
            >
              Pexels
            </a>
            .
          </p>
        )}
        <p className="font-semibold tracking-widest text-foreground uppercase">
          Talking Menu
        </p>
      </div>
    </footer>
  )
}
