# Importing Your Vested Portfolio

A step-by-step guide to download your portfolio data from Vested and upload it into the Market Analyser.

---

## Step 1: Download Your Portfolio CSV from Vested

1. Open the **Vested** app (mobile or web at [vestedfinance.com](https://vestedfinance.com))
2. Go to **Portfolio** tab
3. Tap the **three-dot menu** (top-right corner) or look for **Export / Download**
4. Select **Download Portfolio** or **Export as CSV**
5. The downloaded file will be named something like `Portfolio.csv` or `vested_portfolio.csv`

> **If you don't see an export option:**
> - On the web app, go to **Portfolio > Holdings**, scroll down, and look for a download/export icon
> - On mobile, try **Menu > Statements & Reports > Portfolio Statement**
> - As a last resort, you can manually create a CSV file (see the format below)

---

## Step 2: Verify Your CSV Format

Open the downloaded CSV in any text editor or Excel. A Vested export typically looks like this:

```csv
Name,Ticker,Qty,Avg Cost,Current Value,Return
Apple Inc,AAPL,10,$175.50,"$2,264.00",29.03%
Microsoft Corp,MSFT,5,$310.00,"$2,125.00",37.10%
```

### Required Columns

The importer reads these columns (case-sensitive):

| Column | Required | Description |
|--------|----------|-------------|
| **Ticker** | Yes | Stock symbol (e.g., AAPL, MSFT) |
| **Qty** | Yes | Number of shares held |
| **Avg Cost** | Yes | Your average cost per share (can include `$` and commas) |
| **Name** | No | Company name (stored in notes for reference) |

Other columns like `Current Value`, `Return`, `LTP`, etc. are ignored — the system fetches live prices on its own.

### What Gets Imported

For each row in the CSV:
- **Ticker** is converted to uppercase
- **Entry Date** is set to today's date (Vested doesn't export per-lot purchase dates)
- **Entry Price** is taken from the `Avg Cost` column (dollar signs and commas are stripped automatically)
- **Quantity** is taken from the `Qty` column
- **Position Type** is set to `long`
- **Notes** are set to `Imported from Vested: <Company Name>`
- Rows with empty ticker or zero/negative quantity are skipped

---

## Step 3: Upload to Market Analyser

### Option A: Using the UI

1. Open the app and go to the **Portfolio** tab
2. Scroll down to the **CSV Import** card
3. Click the **Vested** format button (instead of Standard)
4. Drag and drop your CSV file, or click to browse
5. Review the preview to confirm the columns look correct
6. Click **Import (vested)**

### Option B: Using the API directly

```bash
curl -X POST http://localhost:8000/portfolio/import-vested \
  -F "file=@/path/to/your/Portfolio.csv"
```

---

## Important Things to Know

### Before Uploading

- **Clear existing positions first** if you're re-importing — the importer does not check for duplicates. Uploading the same file twice will create duplicate positions.
- **Entry dates will all be today** — Vested doesn't export individual purchase dates in their CSV. If you need accurate entry dates, use the Standard CSV format instead (see below).
- **Fractional shares are supported** — if you hold 0.5 shares, it will import correctly.

### After Uploading

- **Refresh Prices** — click the "Refresh Prices" button on the Portfolio page. This fetches current market prices from Yahoo Finance for all your tickers and calculates unrealized P&L.
- **Sector data** — sectors are auto-populated if fundamental data has been fetched for that ticker. Run an analysis on any ticker to populate its sector.
- **Risk metrics, Monte Carlo, stress tests** — all become available once you have positions with current prices.
- **Currency exposure** — automatically calculated in USD and INR using live exchange rates.

### Data Processing Pipeline

Once imported, your positions go through:

```
CSV Upload → Position Created → Transaction Recorded (BUY) → Cash Ledger Updated
     ↓
Refresh Prices → Current Price Fetched → P&L Calculated
     ↓
Risk Engine → VaR, Sharpe, Beta, Drawdown, Correlation
     ↓
Portfolio Health → 0-100 Score (diversification, risk, performance, balance)
```

---

## Creating a CSV Manually

If you need accurate entry dates or can't export from Vested, create a CSV in **Standard** format:

```csv
ticker,entry_date,entry_price,quantity,position_type
AAPL,2024-03-15,175.50,10,long
MSFT,2024-01-20,310.00,5,long
GOOGL,2023-11-01,140.25,8,long
```

| Column | Required | Format |
|--------|----------|--------|
| ticker | Yes | Stock symbol |
| entry_date | Yes | `YYYY-MM-DD` |
| entry_price | Yes | Number (no `$` or commas) |
| quantity | Yes | Number |
| position_type | No | `long` (default) or `short` |

Upload this using the **Standard** format option in the CSV Import card.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "No file uploaded" error | Make sure you selected a `.csv` file |
| Positions not showing after import | Refresh the page — data should appear immediately |
| All P&L showing as 0 | Click "Refresh Prices" to fetch current market prices |
| Duplicate positions | Delete extras manually — the importer doesn't deduplicate |
| Wrong entry price | Edit the position directly from the positions table |
| CSV has different column names | Rename columns to match: `Ticker`, `Qty`, `Avg Cost` (case-sensitive) |
| Some rows skipped | Check the backend console — rows with empty ticker or qty <= 0 are skipped |
