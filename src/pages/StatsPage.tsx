import { useState, useEffect, useMemo } from "react";
import Chart from "../components/Chart";
import { loadPoolStats, type PoolStats } from "../data";

const CHAIN_OPTIONS = ["All", "v1 core", "v1 espace", "v2 espace"];

function parseDate(yyyyMMDD: string): Date {
  const year = parseInt(yyyyMMDD.slice(0, 4), 10);
  const month = parseInt(yyyyMMDD.slice(4, 6), 10) - 1;
  const day = parseInt(yyyyMMDD.slice(6, 8), 10);
  return new Date(year, month, day);
}

function StatsPage() {
  const [selectedValue, setSelectedValue] = useState("All");
  const [jsonList, setJsonList] = useState<PoolStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPoolStats()
      .then((data) => {
        setJsonList(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading pool stats:", err);
        setLoading(false);
      });
  }, []);

  const chartData = useMemo(() => {
    // Fix v1 core totalPOS by subtracting v1 espace totalPOS (which is already included)
    const v1EspacePOSByDate = new Map<string, number>();
    jsonList.forEach((item) => {
      if (item.version === "v1" && item.chain === "espace") {
        v1EspacePOSByDate.set(item.snapshotDate, item.totalPOS);
      }
    });

    const correctedList = jsonList.map((item) => {
      if (item.version === "v1" && item.chain === "core") {
        const espacePOS = v1EspacePOSByDate.get(item.snapshotDate) ?? 0;
        return { ...item, totalPOS: item.totalPOS - espacePOS };
      }
      return item;
    });

    let filteredList = correctedList;

    if (selectedValue !== "All") {
      filteredList = correctedList.filter(
        (item) => `${item.version} ${item.chain}` === selectedValue,
      );
    }

    // Aggregate by snapshotDate
    const aggregated = filteredList.reduce<
      Record<
        string,
        { snapshotDate: string; stakerNumber: number; totalPOS: number }
      >
    >((acc, { snapshotDate, stakerNumber, totalPOS }) => {
      if (!acc[snapshotDate]) {
        acc[snapshotDate] = { snapshotDate, stakerNumber: 0, totalPOS: 0 };
      }
      acc[snapshotDate].stakerNumber += stakerNumber;
      acc[snapshotDate].totalPOS += totalPOS;
      return acc;
    }, {});

    // Sort by date
    const sortedList = Object.values(aggregated).sort(
      (a, b) =>
        parseDate(a.snapshotDate).getTime() -
        parseDate(b.snapshotDate).getTime(),
    );

    return {
      dates: sortedList.map((item) => item.snapshotDate),
      stakerNumbers: sortedList.map((item) => item.stakerNumber),
      posAmounts: sortedList.map((item) => item.totalPOS / 10),
    };
  }, [jsonList, selectedValue]);

  if (loading) {
    return <div className="no-data">Loading...</div>;
  }

  return (
    <div>
      <h1 className="page-title">ABC Pool Statistics</h1>

      <div className="picker-container">
        <select
          value={selectedValue}
          onChange={(e) => setSelectedValue(e.target.value)}
        >
          {CHAIN_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option === "All" ? "All Chains" : option}
            </option>
          ))}
        </select>
      </div>

      {chartData.dates.length > 0 ? (
        <>
          <Chart
            title="Staker Count"
            legend={selectedValue}
            xData={chartData.dates}
            yData={chartData.stakerNumbers}
          />
          <Chart
            title="Total POS (万)"
            legend={selectedValue}
            xData={chartData.dates}
            yData={chartData.posAmounts}
          />
        </>
      ) : (
        <div className="no-data">No data available</div>
      )}
    </div>
  );
}

export default StatsPage;
