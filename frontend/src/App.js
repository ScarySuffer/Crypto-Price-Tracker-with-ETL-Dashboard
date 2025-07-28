// src/App.js
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Line, Bar, Doughnut } from 'react-chartjs-2'; // Import Doughnut
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement, // Import ArcElement for Doughnut/Pie charts
} from 'chart.js';
import './App.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement, // Register ArcElement
);

function App() {
  const [latestCryptoData, setLatestCryptoData] = useState([]);
  const [historicalData, setHistoricalData] = useState(null);
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chartType, setChartType] = useState('line'); // Default to line chart

  // State for date range
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // NEW: State for Doughnut Chart data
  const [marketCapDoughnutData, setMarketCapDoughnutData] = useState(null);

  // Helper function to format timestamp correctly
  const formatTimestampForDisplay = (timestamp) => {
    if (!timestamp) return 'N/A';

    let cleanTimestamp = timestamp;
    try {
        const dateObj = new Date(cleanTimestamp.replace(' ', 'T') + 'Z'); // Convert to ISO format if space is present, assume UTC
        if (isNaN(dateObj.getTime())) {
            console.warn("Invalid Date object from timestamp, trying direct parse:", cleanTimestamp);
            return new Date(cleanTimestamp).toLocaleString(); // Fallback to direct parse
        }
        return dateObj.toLocaleString(); // Use local string for user-friendly display
    } catch (e) {
        console.error("Error parsing timestamp in formatTimestampForDisplay:", e);
        return timestamp; // Return original if parsing fails
    }
  };

  // Helper to format date for input type="date" (YYYY-MM-DD)
  const formatDateForInput = (date) => {
    if (!date) return '';
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Set default date range to last 30 days on initial load
  useEffect(() => {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    setEndDate(formatDateForInput(today));
    setStartDate(formatDateForInput(thirtyDaysAgo));
  }, []);


  // --- NEW: Function to prepare data for the Doughnut Chart ---
  // Wrapped in useCallback with no dependencies to ensure it's a stable function reference
  const prepareMarketCapDoughnutData = useCallback((data) => {
    if (!data || data.length === 0) {
      setMarketCapDoughnutData(null);
      return;
    }

    // Filter out items without market_cap or zero/null market_cap
    const validData = data.filter(item => item.market_cap && item.market_cap > 0);

    // Sort by market_cap descending
    const sortedData = [...validData].sort((a, b) => b.market_cap - a.market_cap);

    // Take top 7 cryptocurrencies for clarity
    const topN = 7; // You can adjust this number
    const topCryptos = sortedData.slice(0, topN);
    const otherCryptos = sortedData.slice(topN);

    let otherMarketCap = 0;
    if (otherCryptos.length > 0) {
      otherMarketCap = otherCryptos.reduce((sum, item) => sum + item.market_cap, 0);
    }

    const labels = topCryptos.map(crypto => crypto.symbol.toUpperCase());
    const dataValues = topCryptos.map(crypto => crypto.market_cap);
    const backgroundColors = [
      '#00bcd4', // Cyan/Teal
      '#8bc34a', // Light Green
      '#ffeb3b', // Yellow
      '#ff9800', // Orange
      '#f44336', // Red
      '#9c27b0', // Purple
      '#2196f3', // Blue
      '#e91e63', // Pink
      '#03a9f4', // Light Blue
      '#4caf50', // Green
      // Add more colors if your topN is higher
    ];

    if (otherMarketCap > 0) {
      labels.push('Other');
      dataValues.push(otherMarketCap);
      backgroundColors.push('#607d8b'); // Grey for 'Other'
    }

    setMarketCapDoughnutData({
      labels: labels,
      datasets: [
        {
          data: dataValues,
          backgroundColor: backgroundColors.slice(0, labels.length), // Ensure colors match labels count
          borderColor: '#1a1a2e', // Border color for segments
          borderWidth: 1,
        },
      ],
    });
  }, []); // No dependencies for useCallback as it operates on data passed to it


  // --- Initial Fetch for Latest Crypto Data (for initial table load and Doughnut chart) ---
  useEffect(() => {
    const fetchInitialLatestCrypto = async () => {
      try {
        setLoading(true);
        const response = await axios.get('http://localhost:5000/api/crypto');
        setLatestCryptoData(response.data);
        prepareMarketCapDoughnutData(response.data); // Prepare Doughnut data on initial fetch
        setLoading(false);
      } catch (err) {
        setError('Failed to fetch initial crypto data. Is your Node.js API running?');
        setLoading(false);
        console.error(err);
      }
    };

    fetchInitialLatestCrypto();
  }, [prepareMarketCapDoughnutData]); // Added prepareMarketCapDoughnutData as a dependency


  // --- WebSocket for Real-time Latest Data Updates ---
  useEffect(() => {
    let ws;

    const connectWebSocket = () => {
      console.log('Attempting to connect WebSocket...');
      ws = new WebSocket('ws://localhost:5000');

      ws.onopen = () => {
        console.log('WebSocket connected');
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'latest_crypto_update') {
            const uniqueDataMap = new Map();
            message.data.forEach(item => {
              uniqueDataMap.set(item.symbol, item);
            });
            const updatedLatestData = Array.from(uniqueDataMap.values());
            setLatestCryptoData(updatedLatestData);
            prepareMarketCapDoughnutData(updatedLatestData); // Update Doughnut data on real-time update
            console.log('Received real-time update for latest crypto prices. Data processed for uniqueness.');
          }
        } catch (e) {
          console.error('Error parsing WebSocket message:', e);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected. Attempting to reconnect in 3 seconds...');
        setTimeout(connectWebSocket, 3000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setError('WebSocket connection error. Real-time updates may be interrupted.');
      };
    };

    connectWebSocket();

    return () => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('Closing WebSocket connection during component unmount/cleanup.');
        ws.close();
      }
    };
  }, [prepareMarketCapDoughnutData]); // Added prepareMarketCapDoughnutData as a dependency


  // --- Effect to fetch Historical Data for selected symbol and date range ---
  const fetchHistoricalData = useCallback(async () => {
    if (selectedSymbol) {
      try {
        let url = `http://localhost:5000/api/crypto/history/${selectedSymbol}`;
        const params = new URLSearchParams();

        if (startDate) {
          params.append('startDate', startDate); // Use 'startDate' as per backend
        }
        if (endDate) {
          params.append('endDate', endDate);     // Use 'endDate' as per backend
        }

        if (params.toString()) {
          url += `?${params.toString()}`;
        }

        console.log(`Attempting to fetch historical data for: ${selectedSymbol} with URL: ${url}`);
        const response = await axios.get(url);
        setHistoricalData(response.data);
        console.log('Fetched historical data:', response.data);
      } catch (err) {
        console.error(`Error fetching historical data for ${selectedSymbol}:`, err);
        if (err.response) {
          console.error('Data:', err.response.data);
          console.error('Status:', err.response.status);
          console.error('Headers:', err.response.headers);
          setError(`Failed to fetch historical data for ${selectedSymbol}. Server responded with status: ${err.response.status}`);
        } else if (err.request) {
          console.error('Request:', err.request);
          setError(`Failed to fetch historical data for ${selectedSymbol}. No response received from server.`);
        } else {
          console.error('Error message:', err.message);
          setError(`Failed to fetch historical data for ${selectedSymbol}. Error: ${err.message}`);
        }
        setHistoricalData([]); // Set to empty array on error to prevent indefinite loading state
      }
    } else {
      setHistoricalData(null);
    }
  }, [selectedSymbol, startDate, endDate]);

  useEffect(() => {
    // This effect now depends on fetchHistoricalData, which itself depends on selectedSymbol, startDate, endDate.
    // This ensures fetching only happens when these relevant dependencies change.
    fetchHistoricalData();
  }, [fetchHistoricalData]); // This effect now depends on fetchHistoricalData


  // Chart data for historical price (common for both line and bar)
  const commonHistoricalChartData = historicalData ? {
    labels: historicalData.map(data => formatTimestampForDisplay(data.timestamp)),
    datasets: [
      {
        label: `${selectedSymbol} Price (USD)`,
        data: historicalData.map(data => data.current_price),
      },
    ],
  } : {};

  // --- Options for LINE Chart ---
  const historicalLineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#e0e0e0',
        }
      },
      title: {
        display: true,
        text: `Historical Price for ${selectedSymbol || 'Selected Crypto'} (Line Chart)`,
        color: '#00bcd4',
      },
      tooltip: {
        backgroundColor: 'rgba(26, 26, 46, 0.9)',
        titleColor: '#00bcd4',
        bodyColor: '#e0e0e0',
        borderColor: 'rgba(0, 188, 212, 0.5)',
        borderWidth: 1,
        callbacks: {
          title: function(tooltipItems) {
            return `Time: ${tooltipItems[0].label}`;
          },
          label: function(tooltipItem) {
            return `Price: $${tooltipItem.raw.toFixed(4)}`;
          }
        }
      }
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Time',
          color: '#e0e0e0',
        },
        ticks: {
          color: '#e0e0e0',
        },
        grid: {
          color: 'rgba(0, 188, 212, 0.1)',
        }
      },
      y: {
        title: {
          display: true,
          text: 'Price (USD)',
          color: '#e0e0e0',
        },
        ticks: {
          color: '#e0e0e0',
          callback: function(value) {
            return `$${value.toLocaleString()}`;
          }
        },
        grid: {
          color: 'rgba(0, 188, 212, 0.1)',
        },
        beginAtZero: false,
      },
    },
    elements: {
      line: {
        borderColor: 'rgb(0, 188, 212)',
        backgroundColor: 'rgba(0, 188, 212, 0.3)',
        fill: true,
        tension: 0.4,
      },
      point: {
        backgroundColor: 'rgb(0, 188, 212)',
        borderColor: '#e0e0e0',
        borderWidth: 1,
        radius: 3,
        hoverRadius: 5,
      }
    }
  };

  // --- Options for HORIZONTAL BAR Chart ---
  const historicalBarChartOptions = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#e0e0e0',
        }
      },
      title: {
        display: true,
        text: `Historical Price for ${selectedSymbol || 'Selected Crypto'} (Bar Chart)`,
        color: '#00bcd4',
      },
      tooltip: {
        backgroundColor: 'rgba(26, 26, 46, 0.9)',
        titleColor: '#00bcd4',
        bodyColor: '#e0e0e0',
        borderColor: 'rgba(0, 188, 212, 0.5)',
        borderWidth: 1,
        callbacks: {
          title: function(tooltipItems) {
            return `Time: ${tooltipItems[0].label}`;
          },
          label: function(tooltipItem) {
            return `Price: $${tooltipItem.raw.toFixed(4)}`;
          }
        }
      }
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Price (USD)',
          color: '#e0e0e0',
        },
        ticks: {
          color: '#e0e0e0',
          callback: function(value) {
            return `$${value.toLocaleString()}`;
          }
        },
        grid: {
          color: 'rgba(0, 188, 212, 0.1)',
        },
        beginAtZero: true,
      },
      y: {
        title: {
          display: true,
          text: 'Time',
          color: '#e0e0e0',
        },
        ticks: {
          color: '#e0e0e0',
        },
        grid: {
          color: 'rgba(0, 188, 212, 0.1)',
        },
      },
    },
    elements: {
      bar: {
        backgroundColor: 'rgba(0, 188, 212, 0.7)',
        borderColor: 'rgb(0, 188, 212)',
        borderWidth: 1,
        borderRadius: 4,
      }
    }
  };

  // --- NEW: Options for Doughnut Chart ---
  const marketCapDoughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right', // Positioning legend to the right is common for doughnut
        labels: {
          color: '#e0e0e0',
          font: {
            size: 14
          }
        }
      },
      title: {
        display: true,
        text: 'Live Cryptocurrency Market Cap Distribution (Top 7 + Other)',
        color: '#00bcd4',
        font: {
          size: 20
        }
      },
      tooltip: {
        backgroundColor: 'rgba(26, 26, 46, 0.9)',
        titleColor: '#00bcd4',
        bodyColor: '#e0e0e0',
        borderColor: 'rgba(0, 188, 212, 0.5)',
        borderWidth: 1,
        callbacks: {
          label: function(tooltipItem) {
            // Display label and percentage
            const total = tooltipItem.dataset.data.reduce((sum, val) => sum + val, 0);
            const currentValue = tooltipItem.raw;
            const percentage = ((currentValue / total) * 100).toFixed(2);
            return `${tooltipItem.label}: $${currentValue.toLocaleString()} (${percentage}%)`;
          }
        }
      }
    },
    cutout: '70%', // Makes it a doughnut chart
  };


  if (loading) {
    return (
      <div className="App">
        <header className="App-header">
          <h1>Crypto Price Tracker Dashboard</h1>
        </header>
        <div className="dashboard-container">
          <main>
            <p>Loading crypto data...</p>
          </main>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="App">
        <header className="App-header">
          <h1>Crypto Price Tracker Dashboard</h1>
        </header>
        <div className="dashboard-container">
          <main>
            <p className="error-message">Error: {error}</p>
          </main>
        </div>
      </div>
    );
  }

  if (latestCryptoData.length === 0) {
    return (
      <div className="App">
        <header className="App-header">
          <h1>Crypto Price Tracker Dashboard</h1>
        </header>
        <div className="dashboard-container">
          <main>
            <p>No crypto data available. Please ensure your `crypto_etl.py` script has run at least once and the backend API is running!</p>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>Crypto Price Tracker Dashboard</h1>
      </header>
      <div className="dashboard-container">
        <main>
          {/* Section for Latest Crypto Data */}
          <h2>Latest Crypto Data</h2>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Name</th>
                  <th>Price (USD)</th>
                  <th>Market Cap</th>
                  <th>Total Volume</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {latestCryptoData.map((data) => (
                  <tr key={`${data.symbol}-${data.timestamp}`}>
                    <td>{data.symbol.toUpperCase()}</td>
                    <td>{data.name}</td>
                    <td>${data.current_price ? data.current_price.toFixed(4) : 'N/A'}</td>
                    <td>${data.market_cap ? data.market_cap.toLocaleString() : 'N/A'}</td>
                    <td>${data.total_volume ? data.total_volume.toLocaleString() : 'N/A'}</td>
                    <td>{formatTimestampForDisplay(data.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Section for Historical Data Chart */}
          <h2 style={{ marginTop: '40px' }}>Historical Price Chart</h2>
          <div className="select-container">
            <label htmlFor="crypto-select">Select Cryptocurrency:</label>
            <select
              id="crypto-select"
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
            >
              <option value="">-- Select a Symbol --</option>
              {Array.from(new Set(latestCryptoData.map(crypto => crypto.symbol)))
                      .sort()
                      .map(symbol => (
                        <option key={symbol} value={symbol}>{symbol.toUpperCase()}</option> // Display uppercase
              ))}
            </select>
          </div>

          <div className="date-range-picker">
            <label htmlFor="start-date">From:</label>
            <input
              type="date"
              id="start-date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <label htmlFor="end-date">To:</label>
            <input
              type="date"
              id="end-date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              
           />
          </div>

         {/* Chart Type Selector */}
          <div className="chart-type-selector">
            <button
              onClick={() => { setChartType('line'); /* REMOVED: setSelectedSymbol('') */ }} // Now only sets chart type
              className={chartType === 'line' ? 'active' : ''}
            >
              Historical Price (Line)
            </button>
            <button
              onClick={() => { setChartType('bar'); /* REMOVED: setSelectedSymbol('') */ }} // Now only sets chart type
              className={chartType === 'bar' ? 'active' : ''}
            >
              Historical Price (Bar)
            </button>
            <button
              onClick={() => { setChartType('doughnut-market-cap'); setSelectedSymbol('') }} // Keep clearing symbol for market-wide view
              className={chartType === 'doughnut-market-cap' ? 'active' : ''}
            >
              Market Share (Live)
            </button>
          </div>

          {/* Conditional Chart Rendering */}
          <div className="chart-container">
            {chartType === 'doughnut-market-cap' && marketCapDoughnutData ? (
              <Doughnut data={marketCapDoughnutData} options={marketCapDoughnutOptions} />
            ) : chartType === 'line' && selectedSymbol && historicalData && historicalData.length > 0 ? (
              <Line data={commonHistoricalChartData} options={historicalLineChartOptions} />
            ) : chartType === 'bar' && selectedSymbol && historicalData && historicalData.length > 0 ? (
              <Bar data={commonHistoricalChartData} options={historicalBarChartOptions} />
            ) : (
              <p>
                {selectedSymbol && (chartType === 'line' || chartType === 'bar') ?
                  `No historical data available for ${selectedSymbol} in the selected date range.` :
                  `Select a cryptocurrency and a chart type above to view its historical chart, or select "Market Share (Live)" for an overall view.`
                }
              </p>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;