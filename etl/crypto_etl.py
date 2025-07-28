# etl/crypto_etl.py

import requests
import json
import time
import os
from datetime import datetime
import psycopg2 # Import the PostgreSQL driver
import sys # Import the sys module for sys.exit()
from dotenv import load_dotenv

load_dotenv() # Load environment variables from .env file

# Configuration
COINGECKO_API_URL = "https://api.coingecko.com/api/v3/coins/markets"
PARAMS = {
    "vs_currency": "usd",
    "order": "market_cap_desc",
    "per_page": 100, # Get top 100 cryptocurrencies by market cap
    "page": 1,
    "sparkline": "false"
}

# --- PostgreSQL Database Configuration (NOW READING FROM .env FILE) ---
DB_HOST = os.getenv('PG_DB_HOST')
DB_NAME = os.getenv('PG_DB_NAME')
DB_USER = os.getenv('PG_DB_USER')
DB_PASSWORD = os.getenv('PG_DB_PASSWORD')
DB_PORT = os.getenv('PG_DB_PORT') 

# Add a check to ensure essential variables are loaded
if not all([DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, DB_PORT]):
    print("❌ Error: One or more PostgreSQL environment variables are missing. Please check your etl/.env file.")
    sys.exit(1) # Exit if critical variables are missing


# Node.js API endpoint for broadcasting updates
NODE_API_NOTIFY_URL = "http://localhost:5000/api/notify-update"

def get_crypto_data():
    """Fetches cryptocurrency data from CoinGecko API."""
    try:
        # Added a timeout to prevent indefinite hangs
        response = requests.get(COINGECKO_API_URL, params=PARAMS, timeout=10)
        response.raise_for_status()  # Raise an HTTPError for bad responses (4xx or 5xx)
        return response.json()
    except requests.exceptions.Timeout:
        print("Error: CoinGecko API request timed out.")
        return None
    except requests.exceptions.RequestException as e:
        print(f"Error fetching data from CoinGecko API: {e}")
        return None

def connect_db():
    """Establishes a connection to the PostgreSQL database."""
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            database=DB_NAME,
            user=DB_USER,
            password=DB_PASSWORD
        )
        return conn
    except psycopg2.OperationalError as e: # Use psycopg2.OperationalError directly
        print(f"Error connecting to PostgreSQL database: {e}")
        sys.exit(1) # Exit if connection fails


def insert_data(data):
    """Inserts fetched cryptocurrency data into the PostgreSQL database."""
    if not data:
        print("No data to insert.")
        return

    conn = None # Initialize conn to None
    try:
        conn = connect_db() # Use the helper function to get connection
        cur = conn.cursor() # Use 'cur' for cursor
        
        # Get current timestamp with millisecond precision
        current_timestamp = datetime.now().isoformat(timespec='milliseconds')
        
        # Use executemany for efficient batch insertion
        # Prepare a list of tuples for insertion
        records_to_insert = []
        for crypto in data:
            symbol = crypto.get('symbol')
            name = crypto.get('name')
            current_price = crypto.get('current_price')
            market_cap = crypto.get('market_cap')
            total_volume = crypto.get('total_volume')
            
            # Check for essential fields
            if symbol and name and current_price is not None:
                # Append to list as a tuple
                records_to_insert.append((
                    symbol.lower(), # Store symbols in lowercase for consistency with Node.js
                    name,
                    current_price,
                    market_cap,
                    total_volume,
                    current_timestamp
                ))
            else:
                print(f"Skipping incomplete data for crypto: {crypto.get('name', 'N/A')}")
        
        if records_to_insert:
            # PostgreSQL uses %s placeholders
            insert_query = """
                INSERT INTO prices (symbol, name, current_price, market_cap, total_volume, timestamp)
                VALUES (%s, %s, %s, %s, %s, %s)
            """
            cur.executemany(insert_query, records_to_insert)
            conn.commit() # Commit transaction for PostgreSQL
            print(f"✅ Successfully inserted {len(records_to_insert)} records into 'prices' table at {current_timestamp}.")
        else:
            print("No valid records to insert.")

    except psycopg2.Error as e:
        print(f"❌ Error inserting data into PostgreSQL: {e}")
        if conn:
            conn.rollback() # Rollback in case of error
    finally:
        if conn:
            cur.close() # Close cursor
            conn.close() # Close connection

def notify_frontend_update():
    """Notifies the Node.js frontend server about new data via an HTTP POST request."""
    try:
        response = requests.post(NODE_API_NOTIFY_URL)
        response.raise_for_status() # Raise an exception for HTTP errors
        print(f"✅ Successfully notified frontend API: {response.status_code} - {response.json().get('message', 'No message')}")
    except requests.exceptions.RequestException as e:
        print(f"❌ Error notifying frontend API: {e}")

def main():
    """Main ETL process."""
    print(f"--- Starting ETL process at {datetime.now()} ---")
    
    crypto_data = get_crypto_data()
    if crypto_data:
        insert_data(crypto_data) # This function now handles PostgreSQL connection and insertion
        notify_frontend_update() # Notify frontend AFTER data is inserted
    else:
        print("ETL process finished without new data due to API error (no crypto_data fetched).")
    print(f"--- ETL process finished at {datetime.now()} ---\n")

if __name__ == "__main__":
    # main() # Run ETL once when script is executed - REMOVED THIS LINE
    
    # Uncomment the following to run it periodically (e.g., every 5 minutes)
    while True: # UNCOMMENTED
        main() # UNCOMMENTED
        print("Waiting for 5 minutes before next ETL run...") # UNCOMMENTED
        time.sleep(300) # UNCOMMENTED (300 seconds = 5 minutes)