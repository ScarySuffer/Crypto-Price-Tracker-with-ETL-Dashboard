// src/App.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import './App.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

function App() {
  const [cryptoData, setCryptoData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCryptoData = async () => {
      try {
        const response = await axios.get('http://localhost:5000/api/crypto');
        // The API returns data ordered by timestamp DESC.
        // We'll reverse it to show the "oldest" of the latest 10 first on the chart,
        // and take only the latest 10 entries for display in the table/chart.
        // For a snapshot of current prices of different coins,
        // the order of items in 'response.data' doesn't necessarily need to be reversed for a line chart.
        // Let's just take the latest 10 directly for clearer representation.
        setCryptoData(response.data.slice(0, 10)); // Take top 10 as returned
        setLoading(false);
      } catch (err) {
        setError('Failed to fetch crypto data. Is your Node.js API running?');
        setLoading(false);
        console.error(err);
      }
    };

    fetchCryptoData();
    // Optional: Fetch data every 30 seconds for a more "real-time" feel
    const interval = setInterval(fetchCryptoData, 30000);
    return () => clearInterval(interval); // Cleanup on unmount

  }, []); // Empty dependency array means this runs once on mount, and then by interval

  if (loading) {
    return (
      <div className="App">
        <header className="App-header">
          <h1>Crypto Price Tracker Dashboard</h1>
        </header>
        <main>
          <p>Loading crypto data...</p>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="App">
        <header className="App-header">
          <h1>Crypto Price Tracker Dashboard</h1>
        </header>
        <main>
          <p style={{ color: 'red' }}>Error: {error}</p>
        </main>
      </div>
    );
  }

  if (cryptoData.length === 0) {
    return (
      <div className="App">
        <header className="App-header">
          <h1>Crypto Price Tracker Dashboard</h1>
        </header>
        <main>
          <p>No crypto data available. Please ensure your `crypto_etl.py` script has run at least once!</p>
        </main>
      </div>
    );
  }

  // Prepare data for Chart.js
  // labels will be the crypto symbols
  // data will be their current prices
  const chartData = {
    labels: cryptoData.map(data => data.symbol.toUpperCase()),
    datasets: [
      {
        label: 'Current Price (USD)',
        data: cryptoData.map(data => data.current_price), // CORRECTED: from price_usd to current_price
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
        tension: 0.1,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Top 10 Crypto Prices (Snapshot)', // CORRECTED: More appropriate title
      },
    },
    scales: {
      y: {
        beginAtZero: false, // Prices are not zero
      },
    },
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Crypto Price Tracker Dashboard</h1>
      </header>
      <main>
        <div style={{ width: '80%', margin: '0 auto', maxWidth: '800px' }}> {/* Added maxWidth for better display */}
          <Line data={chartData} options={options} />
        </div>

        <h2>Raw Data (Latest 10)</h2>
        <div style={{ maxHeight: '300px', overflowY: 'scroll', border: '1px solid #ccc', padding: '10px', margin: '0 auto', width: '80%', maxWidth: '800px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f2f2f2' }}>
                <th style={{ border: '1px solid #ddd', padding: '8px' }}>Symbol</th>
                <th style={{ border: '1px solid #ddd', padding: '8px' }}>Price (USD)</th>
                <th style={{ border: '1px solid #ddd', padding: '8px' }}>Market Cap</th>
                <th style={{ border: '1px solid #ddd', padding: '8px' }}>Total Volume</th>
                <th style={{ border: '1px solid #ddd', padding: '8px' }}>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {cryptoData.map((data, index) => (
                <tr key={index}>
                  <td style={{ border: '1px solid #ddd', padding: '8px' }}>{data.symbol.toUpperCase()}</td>
                  <td style={{ border: '1px solid #ddd', padding: '8px' }}>${data.current_price.toFixed(2)}</td>
                  <td style={{ border: '1px solid #ddd', padding: '8px' }}>${data.market_cap.toLocaleString()}</td>
                  <td style={{ border: '1px solid #ddd', padding: '8px' }}>${data.total_volume.toLocaleString()}</td>
                  <td style={{ border: '1px solid #ddd', padding: '8px' }}>{new Date(data.timestamp).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

export default App;