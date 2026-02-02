import React, { useState, useEffect } from 'react';
import { Search, RefreshCw, TrendingUp, AlertCircle, Cloud, Droplets, Wind, DollarSign, Activity } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════
// 🔑 ADD YOUR API KEYS HERE (KEEP THESE SECRET!)
// ═══════════════════════════════════════════════════════════════════
const API_KEYS = {
     TOMORROW_IO: process.env.TOMORROW_IO_KEY || 'VcW8r2gfn7QZ9gjOeNog5gnRhMLmNFCm',
     OPENWEATHERMAP: process.env.OWM_KEY || '6d7fba6219a5c77c2ffda5837aba57b1'
   };
// ═══════════════════════════════════════════════════════════════════

export default function WeatherArbDashboard() {
  const [location, setLocation] = useState('');
  const [weatherData, setWeatherData] = useState(null);
  const [polymarketData, setPolymarketData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [opportunities, setOpportunities] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState(null);
  const [weatherSource, setWeatherSource] = useState('');

  // Fetch real Polymarket data
  const fetchPolymarketMarkets = async () => {
    try {
      const response = await fetch('https://gamma-api.polymarket.com/markets?limit=100&active=true');
      const data = await response.json();
      
      // Filter for weather-related markets
      const weatherMarkets = data.filter(market => {
        const question = market.question?.toLowerCase() || '';
        const description = market.description?.toLowerCase() || '';
        const tags = market.tags?.join(' ').toLowerCase() || '';
        
        const weatherKeywords = [
          'weather', 'rain', 'snow', 'temperature', 'storm', 'hurricane',
          'tornado', 'wind', 'flood', 'heat', 'cold', 'celsius', 'fahrenheit',
          'precipitation', 'drought', 'forecast', 'climate'
        ];
        
        return weatherKeywords.some(keyword => 
          question.includes(keyword) || 
          description.includes(keyword) || 
          tags.includes(keyword)
        );
      });
      
      // Parse markets into our format
      const parsedMarkets = weatherMarkets.map(market => {
        const outcomes = market.outcomes || ['Yes', 'No'];
        const outcomePrices = market.outcomePrices || ['0.5', '0.5'];
        
        // Extract location from question if possible
        const locationMatch = market.question?.match(/in ([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/i);
        const extractedLocation = locationMatch ? locationMatch[1] : 'Unknown';
        
        // Determine market type
        let type = 'other';
        const q = market.question?.toLowerCase() || '';
        if (q.includes('rain') || q.includes('precipitation')) type = 'rain';
        else if (q.includes('temperature') || q.includes('degrees') || q.includes('°')) type = 'temperature';
        else if (q.includes('snow')) type = 'snow';
        else if (q.includes('wind')) type = 'wind';
        else if (q.includes('storm') || q.includes('hurricane')) type = 'storm';
        
        return {
          id: market.id || Math.random().toString(),
          question: market.question || 'Unknown question',
          location: extractedLocation,
          date: market.endDate ? new Date(market.endDate).toISOString().split('T')[0] : 'TBD',
          yesOdds: parseFloat(outcomePrices[0]) * 100,
          noOdds: parseFloat(outcomePrices[1]) * 100,
          type: type,
          volume: market.volume || 0,
          liquidity: market.liquidity || 0
        };
      });
      
      return parsedMarkets;
    } catch (error) {
      console.error('Error fetching Polymarket data:', error);
      return [];
    }
  };

  // Fetch weather data from Tomorrow.io (primary)
  const fetchTomorrowIO = async (city) => {
    const apiKey = API_KEYS.TOMORROW_IO;
    
    if (apiKey === 'YOUR_TOMORROW_IO_API_KEY_HERE') {
      throw new Error('Please add your Tomorrow.io API key in the code');
    }
    
    try {
      // Geocode the city
      const geocodeResponse = await fetch(
        `https://api.tomorrow.io/v4/weather/realtime?location=${encodeURIComponent(city)}&apikey=${apiKey}`
      );
      
      if (!geocodeResponse.ok) {
        throw new Error(`Tomorrow.io API error: ${geocodeResponse.status}`);
      }
      
      const realtimeData = await geocodeResponse.json();
      const location = realtimeData.location;
      
      // Fetch forecast
      const forecastResponse = await fetch(
        `https://api.tomorrow.io/v4/weather/forecast?location=${location.lat},${location.lon}&timesteps=1h,1d&apikey=${apiKey}`
      );
      
      if (!forecastResponse.ok) {
        throw new Error(`Tomorrow.io forecast error: ${forecastResponse.status}`);
      }
      
      const forecastData = await forecastResponse.json();
      
      // Process data
      const processedData = {
        city: city,
        forecast: []
      };
      
      // Process daily forecasts
      if (forecastData.timelines?.daily) {
        forecastData.timelines.daily.forEach((day, index) => {
          if (index < 7) {
            const values = day.values;
            const date = new Date(day.time).toISOString().split('T')[0];
            
            processedData.forecast.push({
              date: date,
              temp: values.temperatureAvg || values.temperatureMax || 0,
              tempMin: values.temperatureMin || 0,
              tempMax: values.temperatureMax || 0,
              rainProbability: values.precipitationProbabilityAvg || 0,
              windSpeed: values.windSpeedAvg || 0,
              windGust: values.windGustMax || 0,
              humidity: values.humidityAvg || 0,
              cloudCover: values.cloudCoverAvg || 0,
              conditions: getWeatherCondition(values),
              uvIndex: values.uvIndexMax || 0,
              visibility: values.visibilityAvg || 10,
              snowAccumulation: values.snowAccumulation || 0
            });
          }
        });
      }
      
      // Enhance with hourly data for today
      if (forecastData.timelines?.hourly) {
        const todayHourly = forecastData.timelines.hourly.slice(0, 24);
        const todayDate = new Date().toISOString().split('T')[0];
        
        const todayForecast = processedData.forecast.find(f => f.date === todayDate);
        if (todayForecast && todayHourly.length > 0) {
          const hourlyRainProbs = todayHourly.map(h => h.values.precipitationProbability || 0);
          const hourlyWindSpeeds = todayHourly.map(h => h.values.windSpeed || 0);
          
          todayForecast.rainProbability = Math.max(...hourlyRainProbs);
          todayForecast.windSpeed = Math.max(...hourlyWindSpeeds);
          todayForecast.maxHourlyTemp = Math.max(...todayHourly.map(h => h.values.temperature || 0));
        }
      }
      
      return { data: processedData, source: 'Tomorrow.io' };
      
    } catch (error) {
      console.error('Tomorrow.io error:', error);
      throw error;
    }
  };

  // Fetch weather data from OpenWeatherMap (backup)
  const fetchOpenWeatherMap = async (city) => {
    const apiKey = API_KEYS.OPENWEATHERMAP;
    
    if (apiKey === 'YOUR_OPENWEATHERMAP_API_KEY_HERE') {
      throw new Error('Please add your OpenWeatherMap API key in the code');
    }
    
    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&units=metric&appid=${apiKey}`
      );
      
      if (!response.ok) {
        throw new Error(`OpenWeatherMap API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Process data
      const processedData = {
        city: city,
        forecast: []
      };
      
      // Group by day
      const dailyData = {};
      data.list.forEach(item => {
        const date = item.dt_txt.split(' ')[0];
        if (!dailyData[date]) {
          dailyData[date] = [];
        }
        dailyData[date].push(item);
      });
      
      // Process each day
      Object.keys(dailyData).slice(0, 7).forEach(date => {
        const dayData = dailyData[date];
        const temps = dayData.map(d => d.main.temp);
        const windSpeeds = dayData.map(d => d.wind.speed * 3.6); // m/s to km/h
        
        // Calculate rain probability
        const rainItems = dayData.filter(d => 
          d.weather[0].main === 'Rain' || 
          d.weather[0].main === 'Drizzle' ||
          (d.pop && d.pop > 0)
        );
        const rainProbability = rainItems.length > 0 
          ? Math.max(...dayData.map(d => (d.pop || 0) * 100))
          : 0;
        
        // Check for snow
        const hasSnow = dayData.some(d => d.weather[0].main === 'Snow');
        
        processedData.forecast.push({
          date: date,
          temp: Math.max(...temps),
          tempMin: Math.min(...temps),
          tempMax: Math.max(...temps),
          rainProbability: rainProbability,
          windSpeed: Math.max(...windSpeeds),
          windGust: Math.max(...windSpeeds) * 1.3, // Estimate
          humidity: dayData[0].main.humidity,
          cloudCover: dayData[0].clouds.all,
          conditions: hasSnow ? 'snow' : dayData[0].weather[0].main.toLowerCase(),
          uvIndex: 0, // Not available in free tier
          visibility: (dayData[0].visibility || 10000) / 1000,
          snowAccumulation: hasSnow ? 1 : 0
        });
      });
      
      return { data: processedData, source: 'OpenWeatherMap' };
      
    } catch (error) {
      console.error('OpenWeatherMap error:', error);
      throw error;
    }
  };

  // Main weather fetch - runs BOTH APIs simultaneously
  const fetchWeatherData = async (city) => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch from BOTH APIs at the same time
      const [tomorrowResult, owmResult] = await Promise.allSettled([
        fetchTomorrowIO(city),
        fetchOpenWeatherMap(city)
      ]);
      
      let combinedData = null;
      let sources = [];
      
      // Check which APIs succeeded
      const tomorrowSuccess = tomorrowResult.status === 'fulfilled';
      const owmSuccess = owmResult.status === 'fulfilled';
      
      if (tomorrowSuccess && owmSuccess) {
        // BOTH APIs worked - combine their data for maximum accuracy
        console.log('✅ Both APIs succeeded - combining data');
        combinedData = combineWeatherData(
          tomorrowResult.value.data,
          owmResult.value.data
        );
        sources = ['Tomorrow.io', 'OpenWeatherMap'];
      } else if (tomorrowSuccess) {
        // Only Tomorrow.io worked
        console.log('✅ Tomorrow.io only');
        combinedData = tomorrowResult.value.data;
        sources = ['Tomorrow.io'];
      } else if (owmSuccess) {
        // Only OpenWeatherMap worked
        console.log('✅ OpenWeatherMap only');
        combinedData = owmResult.value.data;
        sources = ['OpenWeatherMap'];
      } else {
        // Both failed
        throw new Error('Both weather APIs failed. Check your API keys.');
      }
      
      setWeatherData(combinedData);
      setWeatherSource(sources.join(' + '));
      
      // Fetch Polymarket data
      const markets = await fetchPolymarketMarkets();
      setPolymarketData(markets);
      
      setLastUpdate(new Date());
      
    } catch (error) {
      console.error('Weather fetch error:', error);
      setError(error.message || 'Failed to fetch weather data. Please check your API keys.');
    }
    
    setLoading(false);
  };

  // Combine data from both APIs for better accuracy
  const combineWeatherData = (tomorrowData, owmData) => {
    const combined = {
      city: tomorrowData.city,
      forecast: []
    };
    
    // Merge forecasts by date
    const dateMap = new Map();
    
    // Add Tomorrow.io data
    tomorrowData.forecast.forEach(day => {
      dateMap.set(day.date, { tomorrow: day, owm: null });
    });
    
    // Add OpenWeatherMap data
    owmData.forecast.forEach(day => {
      if (dateMap.has(day.date)) {
        dateMap.get(day.date).owm = day;
      } else {
        dateMap.set(day.date, { tomorrow: null, owm: day });
      }
    });
    
    // Combine each day's data
    dateMap.forEach((sources, date) => {
      const { tomorrow, owm } = sources;
      
      // If both sources available, average the predictions
      if (tomorrow && owm) {
        combined.forecast.push({
          date: date,
          temp: (tomorrow.temp + owm.temp) / 2,
          tempMin: Math.min(tomorrow.tempMin || tomorrow.temp, owm.tempMin || owm.temp),
          tempMax: Math.max(tomorrow.tempMax || tomorrow.temp, owm.tempMax || owm.temp),
          rainProbability: (tomorrow.rainProbability + owm.rainProbability) / 2, // Average both
          windSpeed: Math.max(tomorrow.windSpeed, owm.windSpeed), // Use higher prediction
          windGust: Math.max(tomorrow.windGust || 0, owm.windGust || 0),
          humidity: (tomorrow.humidity + owm.humidity) / 2,
          cloudCover: (tomorrow.cloudCover + owm.cloudCover) / 2,
          conditions: tomorrow.conditions, // Prefer Tomorrow.io
          uvIndex: tomorrow.uvIndex || owm.uvIndex || 0,
          visibility: Math.min(tomorrow.visibility, owm.visibility),
          snowAccumulation: Math.max(tomorrow.snowAccumulation || 0, owm.snowAccumulation || 0),
          // Add metadata about sources
          _sources: {
            tomorrowRainProb: tomorrow.rainProbability,
            owmRainProb: owm.rainProbability,
            tomorrowTemp: tomorrow.temp,
            owmTemp: owm.temp
          }
        });
      } else if (tomorrow) {
        // Only Tomorrow.io data
        combined.forecast.push(tomorrow);
      } else if (owm) {
        // Only OpenWeatherMap data
        combined.forecast.push(owm);
      }
    });
    
    // Sort by date
    combined.forecast.sort((a, b) => a.date.localeCompare(b.date));
    
    return combined;
  };

  // Find arbitrage opportunities
  const findOpportunities = (weather, markets) => {
    if (!weather || !markets || markets.length === 0) {
      setOpportunities([]);
      return;
    }
    
    const opps = [];
    
    markets.forEach(market => {
      // Try to match location (fuzzy matching)
      const marketLocation = market.location.toLowerCase();
      const weatherCity = weather.city.toLowerCase();
      
      const locationMatch = 
        marketLocation.includes(weatherCity) || 
        weatherCity.includes(marketLocation) ||
        marketLocation === 'unknown'; // Match if we couldn't extract location
      
      if (locationMatch || market.location === 'Unknown') {
        const forecastDay = weather.forecast.find(f => f.date === market.date) || weather.forecast[0];
        
        if (forecastDay) {
          let discrepancy = 0;
          let recommendation = '';
          let confidence = 0;
          let reasoning = '';
          
          if (market.type === 'rain') {
            const forecastProb = forecastDay.rainProbability;
            discrepancy = Math.abs(forecastProb - market.yesOdds);
            
            if (forecastProb > market.yesOdds + 15) {
              recommendation = 'BUY YES';
              confidence = Math.min(90, forecastProb);
              reasoning = `Forecast shows ${forecastProb.toFixed(0)}% chance of rain, but market is only at ${market.yesOdds.toFixed(0)}%`;
            } else if (forecastProb < market.yesOdds - 15) {
              recommendation = 'BUY NO';
              confidence = Math.min(90, 100 - forecastProb);
              reasoning = `Forecast shows only ${forecastProb.toFixed(0)}% chance of rain, but market is at ${market.yesOdds.toFixed(0)}%`;
            }
          } 
          else if (market.type === 'temperature') {
            // Extract threshold from question
            const tempMatch = market.question.match(/(\d+)\s*°?[CF]/);
            const threshold = tempMatch ? parseInt(tempMatch[1]) : 30;
            const isCelsius = market.question.includes('°C') || market.question.includes('Celsius');
            
            const forecastTemp = isCelsius ? forecastDay.tempMax : (forecastDay.tempMax * 9/5) + 32;
            const willExceed = forecastTemp > threshold;
            const forecastProb = willExceed ? 85 : 15;
            
            discrepancy = Math.abs(forecastProb - market.yesOdds);
            
            if (willExceed && market.yesOdds < 70) {
              recommendation = 'BUY YES';
              confidence = 80;
              reasoning = `Forecast: ${forecastTemp.toFixed(1)}°${isCelsius ? 'C' : 'F'} (above ${threshold}°), but market only at ${market.yesOdds.toFixed(0)}%`;
            } else if (!willExceed && market.noOdds < 70) {
              recommendation = 'BUY NO';
              confidence = 80;
              reasoning = `Forecast: ${forecastTemp.toFixed(1)}°${isCelsius ? 'C' : 'F'} (below ${threshold}°), but market favors YES at ${market.yesOdds.toFixed(0)}%`;
            }
          }
          else if (market.type === 'wind') {
            const windMatch = market.question.match(/(\d+)\s*(?:km\/h|mph|knots)/i);
            const threshold = windMatch ? parseInt(windMatch[1]) : 50;
            const isMph = market.question.toLowerCase().includes('mph');
            
            const forecastWind = isMph ? forecastDay.windSpeed * 0.621371 : forecastDay.windSpeed;
            const willExceed = forecastWind > threshold;
            const forecastProb = willExceed ? 80 : 20;
            
            discrepancy = Math.abs(forecastProb - market.yesOdds);
            
            if (willExceed && market.yesOdds < 60) {
              recommendation = 'BUY YES';
              confidence = 75;
              reasoning = `Forecast: ${forecastWind.toFixed(0)} ${isMph ? 'mph' : 'km/h'} winds (above ${threshold}), market at ${market.yesOdds.toFixed(0)}%`;
            } else if (!willExceed && market.noOdds < 60) {
              recommendation = 'BUY NO';
              confidence = 75;
              reasoning = `Forecast: ${forecastWind.toFixed(0)} ${isMph ? 'mph' : 'km/h'} winds (below ${threshold}), market at ${market.yesOdds.toFixed(0)}%`;
            }
          }
          else if (market.type === 'snow') {
            const willSnow = forecastDay.conditions === 'snow' || forecastDay.snowAccumulation > 0;
            const forecastProb = willSnow ? 75 : 10;
            
            discrepancy = Math.abs(forecastProb - market.yesOdds);
            
            if (willSnow && market.yesOdds < 50) {
              recommendation = 'BUY YES';
              confidence = 70;
              reasoning = `Forecast predicts snow, but market only at ${market.yesOdds.toFixed(0)}%`;
            } else if (!willSnow && market.noOdds < 70) {
              recommendation = 'BUY NO';
              confidence = 70;
              reasoning = `No snow in forecast, but market at ${market.yesOdds.toFixed(0)}%`;
            }
          }
          
          // Only include if significant discrepancy and we have a recommendation
          if (discrepancy > 15 && recommendation) {
            opps.push({
              ...market,
              discrepancy: Math.round(discrepancy),
              recommendation,
              confidence,
              reasoning,
              forecastData: forecastDay
            });
          }
        }
      }
    });
    
    // Sort by discrepancy (biggest opportunities first)
    setOpportunities(opps.sort((a, b) => b.discrepancy - a.discrepancy));
  };

  // Helper function to determine weather condition
  const getWeatherCondition = (values) => {
    if (values.snowAccumulation > 0) return 'snow';
    if (values.precipitationProbabilityAvg > 60) return 'rain';
    if (values.cloudCoverAvg > 70) return 'cloudy';
    return 'clear';
  };

  // Re-run opportunity analysis when data changes
  useEffect(() => {
    if (weatherData && polymarketData.length > 0) {
      findOpportunities(weatherData, polymarketData);
    }
  }, [weatherData, polymarketData]);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    if (!location) return;
    
    const interval = setInterval(() => {
      console.log('Auto-refreshing data...');
      fetchWeatherData(location);
    }, 300000); // 5 minutes
    
    return () => clearInterval(interval);
  }, [location]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (location.trim()) {
      fetchWeatherData(location.trim());
    }
  };

  const handleRefresh = () => {
    if (location) {
      fetchWeatherData(location);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <TrendingUp className="w-8 h-8 text-indigo-600" />
            <h1 className="text-3xl font-bold text-gray-800">Weather Arbitrage Finder</h1>
            <div className="ml-auto flex items-center gap-2">
              <Activity className="w-5 h-5 text-green-500" />
              <span className="text-sm font-semibold text-green-600">LIVE</span>
            </div>
          </div>
          
          <p className="text-gray-600 mb-6">
            Find opportunities where Polymarket odds don't match real-time weather forecasts
          </p>

          {/* Search Form */}
          <form onSubmit={handleSearch} className="flex gap-3 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Enter city name (e.g., New York, Sydney, London, Tokyo, Chicago)"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2 transition"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  Search
                </>
              )}
            </button>
            {weatherData && (
              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading}
                className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition"
                title="Refresh data"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            )}
          </form>

          {/* Status Info */}
          <div className="flex items-center justify-between text-sm">
            {lastUpdate && (
              <div className="flex items-center gap-4">
                <p className="text-gray-500">
                  Last updated: {lastUpdate.toLocaleTimeString()}
                </p>
                {weatherSource && (
                  <div className="flex items-center gap-2">
                    <p className="text-gray-400">
                      Sources: <span className="font-semibold text-indigo-600">{weatherSource}</span>
                    </p>
                    {weatherSource.includes('+') && (
                      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded">
                        DUAL API ✓
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
            {weatherData && (
              <p className="text-xs text-gray-400">
                Auto-refreshing every 5 minutes
              </p>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-red-800 font-semibold">Error</p>
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Opportunities Section */}
        {opportunities.length > 0 && (
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
            <div className="flex items-center gap-2 mb-6">
              <DollarSign className="w-6 h-6 text-green-600" />
              <h2 className="text-2xl font-bold text-gray-800">
                {opportunities.length} Arbitrage {opportunities.length === 1 ? 'Opportunity' : 'Opportunities'} Found
              </h2>
            </div>

            <div className="space-y-4">
              {opportunities.map((opp) => (
                <div
                  key={opp.id}
                  className="border-2 border-green-200 rounded-xl p-6 bg-green-50 hover:shadow-lg transition-shadow"
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-800 mb-2">
                        {opp.question}
                      </h3>
                      <div className="flex items-center gap-4 text-sm text-gray-600 mb-2">
                        <span className="flex items-center gap-1">
                          <Cloud className="w-4 h-4" />
                          {opp.location}
                        </span>
                        <span>{opp.date}</span>
                        {opp.volume > 0 && (
                          <span className="flex items-center gap-1">
                            <DollarSign className="w-4 h-4" />
                            Vol: ${opp.volume.toLocaleString()}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 italic">{opp.reasoning}</p>
                    </div>
                    <div className="text-right ml-4">
                      <div className={`inline-block px-4 py-2 rounded-lg font-bold text-lg mb-2 ${
                        opp.recommendation === 'BUY YES' 
                          ? 'bg-green-600 text-white' 
                          : 'bg-red-600 text-white'
                      }`}>
                        {opp.recommendation}
                      </div>
                      <div className="text-sm text-gray-600">
                        Confidence: {opp.confidence}%
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-green-200">
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Market Odds</p>
                      <p className="font-semibold text-sm">
                        Yes: {opp.yesOdds.toFixed(1)}%
                      </p>
                      <p className="font-semibold text-sm">
                        No: {opp.noOdds.toFixed(1)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Weather Data</p>
                      <p className="font-semibold text-sm">
                        {opp.type === 'rain' && `Rain: ${opp.forecastData.rainProbability.toFixed(0)}%`}
                        {opp.type === 'temperature' && `${opp.forecastData.tempMax.toFixed(1)}°C`}
                        {opp.type === 'wind' && `${opp.forecastData.windSpeed.toFixed(0)} km/h`}
                        {opp.type === 'snow' && `${opp.forecastData.conditions}`}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Discrepancy</p>
                      <p className="font-bold text-green-700 text-lg">
                        {opp.discrepancy}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Type</p>
                      <p className="font-semibold text-sm capitalize">
                        {opp.type}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No Opportunities Message */}
        {weatherData && opportunities.length === 0 && !loading && !error && (
          <div className="bg-white rounded-2xl shadow-xl p-12">
            <div className="text-center text-gray-600">
              <AlertCircle className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <h3 className="text-xl font-semibold mb-2">No Arbitrage Opportunities Found</h3>
              <p className="text-lg mb-4">
                Markets are currently aligned with forecasts for {weatherData.city}
              </p>
              <p className="text-sm">
                Checked {polymarketData.length} weather markets • Try another location or check back later
              </p>
            </div>
          </div>
        )}

        {/* How It Works */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">How It Works</h3>
          <div className="grid md:grid-cols-4 gap-6 text-sm text-gray-600">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Cloud className="w-5 h-5 text-indigo-600" />
                <span className="font-semibold">Dual Weather APIs</span>
              </div>
              <p>Runs Tomorrow.io AND OpenWeatherMap simultaneously, averages predictions for maximum accuracy</p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-5 h-5 text-indigo-600" />
                <span className="font-semibold">Real Polymarket</span>
              </div>
              <p>Fetches live betting markets directly from Polymarket's API</p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-5 h-5 text-indigo-600" />
                <span className="font-semibold">Find Edge</span>
              </div>
              <p>Identifies 15%+ discrepancies between combined forecast probability and market odds</p>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <RefreshCw className="w-5 h-5 text-indigo-600" />
                <span className="font-semibold">Auto-Update</span>
              </div>
              <p>Refreshes every 5 minutes to catch newly created opportunities</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
