# crypto_etl.py

import requests
import pandas as pd
import sqlite3

# === 1. Extract data from API ===
url = "https://api.coingecko.com/api/v3/coins/markets"
params = {
    'vs_currency': 'usd',
    'order': 'market_cap_desc',
    'per_page': 10,
    'page': 1,
    'sparkline': False
}

response = requests.get(url, params=params)
data = response.json()

# === 2. Transform: Keep selected fields and add timestamp ===
df = pd.DataFrame(data)[['id', 'symbol', 'current_price', 'market_cap', 'total_volume']]
df['timestamp'] = pd.Timestamp.now()

# === 3. Load into SQLite database ===
# Connect to or create the database
conn = sqlite3.connect("../crypto.db")  # database will be created one folder above

# Load DataFrame into SQL table
df.to_sql("prices", conn, if_exists="append", index=False)

# Confirm
print("✅ Data loaded into crypto.db successfully.")

# Optional: View last inserted data
print(df)

conn.close()
