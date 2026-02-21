import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Seed a default watchlist
  const existing = await prisma.watchlist.findFirst({ where: { name: "My Watchlist" } });
  if (!existing) {
    await prisma.watchlist.create({
      data: {
        name: "My Watchlist",
        tickers: ["AAPL", "MSFT", "NVDA", "TSLA", "SPY", "AMZN", "META", "AMD"],
      },
    });
    console.log("Seeded watchlist.");
  } else {
    console.log("Watchlist already exists, skipping.");
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
