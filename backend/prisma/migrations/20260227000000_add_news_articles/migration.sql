CREATE TABLE "NewsArticle" (
    "id"         SERIAL PRIMARY KEY,
    "ticker"     TEXT NOT NULL,
    "title"      TEXT NOT NULL,
    "body"       TEXT NOT NULL,
    "author"     TEXT NOT NULL,
    "source"     TEXT NOT NULL,
    "createdAt"  TEXT NOT NULL,
    "receivedAt" TEXT NOT NULL
);

CREATE INDEX "NewsArticle_receivedAt_idx" ON "NewsArticle"("receivedAt");
CREATE INDEX "NewsArticle_source_idx"     ON "NewsArticle"("source");
