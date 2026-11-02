/**
 * Starter keyword list shared by every user. Each user's own keywords are saved
 * in the database from the app, and always win over these.
 *
 * Keep this list generic: anything personal belongs in a user's own keywords.
 *
 * Descriptions are uppercased, have \ and / turned into spaces, and are padded
 * with a space each side before matching, so " BP " only matches the word BP.
 * When several keywords match, the longest one wins.
 */
export const CATEGORY_KEYWORDS = {
  GROCERIES: ['WOOLWORTHS', 'COLES', 'ALDI', ' IGA ', 'HARRIS FARM', 'COSTCO'],
  FOOD: ['MCDONALDS', ' KFC ', 'HUNGRY JACKS', 'SUBWAY', 'DOMINOS', 'GUZMAN', ' NANDOS ', 'GRILLD', 'STARBUCKS', 'CAFE', 'COFFEE', 'BAKERY', 'PIZZA', 'SUSHI'],
  DELIVERED_FOOD: ['UBER *EATS', 'UBER EATS', 'DOORDASH', 'MENULOG'],
  FUEL: [' AMPOL ', ' BP ', ' SHELL ', ' CALTEX ', '7-ELEVEN', 'UNITED PETROLEUM', 'EG GROUP', 'APW FUEL'],
  PUBLIC_TRANSPORT: ['OPAL', 'TRANSPORTFORNSW', ' MYKI ', 'TRANSLINK'],
  TOLLS: [' ETOLL ', 'LINKT'],
  PARKING: ['PARKING', 'WILSON PARKING', 'SECURE PARKING'],
  SUBSCRIPTIONS: ['SPOTIFY', 'NETFLIX', 'DISNEY PLUS', 'STAN.COM', 'YOUTUBE', 'ADOBE', 'APPLE.COM BILL', 'AMZNPRIMEA'],
  SHOPPING: [' AMAZON ', 'KMART', ' TARGET ', ' BIG W ', 'JB HI FI', 'OFFICEWORKS', 'BUNNINGS', 'IKEA'],
  HEALTH: ['CHEMIST WAREHOUSE', 'PRICELINE', 'PHARMACY', 'MEDICAL'],
  INSURANCE: ['BUPA', 'MEDIBANK', ' NIB ', ' HCF ', 'NRMA INSURANCE', 'AAMI', 'ALLIANZ'],
  MOBILE_DATA: ['TELSTRA', 'OPTUS', 'VODAFONE', 'BOOST PREPAID', 'AMAYSIM'],
  GOVERNMENT: ['SERVICE NSW', 'SERVICE VIC'],
  INTERNAL_TRANSFERS: ['FUNDS TRANSFER', 'FUNDS TFER', 'PAYID PAYMENT RECEIVED'],
  INCOME: ['SALARY', 'TRANSFER FROM ATO'],
};
