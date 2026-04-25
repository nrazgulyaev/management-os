export const portfolioMetrics = {
  occupancyYTD: { value: 83.2, deltaYoY: 4.6 }, // %
  adr: { value: 912_000_000, deltaYoY: 3.1, currency: "IDR" }, // minor
  revpar: { value: 758_784_000, deltaYoY: 7.9, currency: "IDR" },
  grossRevenueMTD: { value: 1_364_400_000_000, deltaYoY: 12.4 }, // minor
  netOwnerPayoutsMTD: { value: 742_100_000_000, deltaYoY: 8.7 },
  openMaintenance: { value: 4, sla: 2 }, // 2 within SLA
  upcomingCheckins: { value: 12, today: 3 },
  housekeepingOpen: { value: 6, onTrack: 5 },
};

export const revenueByChannel = [
  { channel: "Airbnb", share: 38.2, tone: "emerald" },
  { channel: "Booking.com", share: 26.4, tone: "gold" },
  { channel: "Direct", share: 19.7, tone: "sage" },
  { channel: "Agoda", share: 9.1, tone: "stone" },
  { channel: "Agent", share: 6.6, tone: "terracotta" },
];

export const monthlyRevenueStrip = [
  { month: "Nov", revenue: 1_080 },
  { month: "Dec", revenue: 1_520 },
  { month: "Jan", revenue: 1_410 },
  { month: "Feb", revenue: 1_260 },
  { month: "Mar", revenue: 1_330 },
  { month: "Apr", revenue: 1_364 },
];
