import { executeQuery } from "./db";

// Function to get price from database (mimicking utill.getCount in original code)
export async function getPriceFromDatabase(priceId: number) {
  try {
    const result = await executeQuery(
      'SELECT reg_pprice FROM cr_reg_price WHERE reg_pid = @priceId',
      { priceId }
    );

    console.log(result.recordset[0].reg_pprice, "result")

    return result.recordset.length > 0 ? parseInt(result.recordset[0].reg_pprice) : 0;
  } catch (error) {
    console.error('Error fetching price:', error);
    return 0;
  }
}

// Billing calculation function with database price fetching
export async function calculateBilling(options: any) {
  console.log(options, "options")

  let total = 0;
  let mntot = 0;
  let seatot = 0;
  let sdatot = 0;
  let admntot = 0; //additional copies total
  let othretot = 0;
  let othretot1 = 0;
  let acType = 'S'; // Default to Single Account

  // Pricing IDs mapped to the original C# code
  const PRICE_IDS: any = {
    monthlyNews: {
      '1 year': 1,   // 1 year standard
      '2 years': 2    // 2 year extended
    },
    additionalCopies: {
      1: 3,  // 1 additional copy
      2: 4,  // 2 additional copies
      3: 5,  // 3 additional copies
      4: 6   // 4 additional copies
    },
    searchEngineAccess: {
      '3 months': 7,   // Quarter
      '6 months': 8,   // Half Year
      '12 months': 9,   // Annual
      '24 months': 10   // Biennial
    },
    statisticalDatabaseAccess: {
      '1 year': 11,  // 1 year standard
      '2 years': 12   // 2 years extended
    },
    otherReports: {
      'Central European Olefins & Polyolefin Production': 13,   // Special Economic Policy report
      'Polish Chemical Production': 14   // Another specific report
    }
  };

  // Monthly News
  if (options.monthlyNews) {
    const monthlyNewsId = options.monthlyNews.duration === '1 year'
      ? PRICE_IDS.monthlyNews['1 year']
      : PRICE_IDS.monthlyNews['2 years'];
    mntot += await getPriceFromDatabase(monthlyNewsId);
  } else if (options.accountType === 'Corporate') {
    mntot += await getPriceFromDatabase(PRICE_IDS.monthlyNews['1 year']);
  }

  // Additional News Copies
  if (options.additionalCopies) {
    for (let index = 0; index < options.additionalCopies.copies; index++) {
      const additionalCopyId = PRICE_IDS.additionalCopies[index + 1];
      admntot += await getPriceFromDatabase(additionalCopyId);
    }
    total += admntot
  }

  // Search Engine Access
  if (options.searchEngineAccess) {
    const searchEngineId = PRICE_IDS.searchEngineAccess[options.searchEngineAccess.duration];
    seatot += await getPriceFromDatabase(searchEngineId);
  } else if (options.accountType === 'Corporate') {
    seatot += await getPriceFromDatabase(7);  // Search Engine
  }

  // Statistical Database Access
  if (options.statisticalDatabaseAccess) {
    const dbAccessId = options.statisticalDatabaseAccess.duration === '1 year'
      ? PRICE_IDS.statisticalDatabaseAccess['1 year']
      : PRICE_IDS.statisticalDatabaseAccess['2 years'];
    sdatot += await getPriceFromDatabase(dbAccessId);
  } else if (options.accountType === 'Corporate') {
    sdatot += await getPriceFromDatabase(11); // Statistical DB
  }


  // Other Reports
  if (options.otherReports && options.otherReports.length > 0) {
    for (const report of options.otherReports) {
      const reportId = PRICE_IDS.otherReports[report];
      if (reportId === 13) {
        othretot = await getPriceFromDatabase(reportId);
        total += othretot
      }
      if (reportId === 14) {
        othretot1 = await getPriceFromDatabase(reportId);
        total += othretot1
      }
    }
  }

  total += mntot + seatot + sdatot

  return {
    total, acType, mntot, seatot, sdatot, admntot, othretot, othretot1,
  };
}