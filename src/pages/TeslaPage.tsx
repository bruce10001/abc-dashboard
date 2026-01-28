import { useState, useEffect, useMemo } from "react";
import { loadTeslaSnapshot, type TeslaSnapshot } from "../data";

function truncateAddress(addr: string): string {
  if (addr.length <= 8) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function TeslaPage() {
  const [searchAddr, setSearchAddr] = useState("");
  const [jsonList, setJsonList] = useState<TeslaSnapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTeslaSnapshot()
      .then((data) => {
        setJsonList(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading tesla snapshot:", err);
        setLoading(false);
      });
  }, []);

  const filteredData = useMemo(() => {
    let data = jsonList;

    if (searchAddr.trim()) {
      data = data.filter((item) =>
        item.espaceAddr.toLowerCase().includes(searchAddr.toLowerCase()),
      );
    }

    // Sort by vote count (descending)
    return [...data].sort((a, b) => b.vote - a.vote);
  }, [jsonList, searchAddr]);

  if (loading) {
    return <div className="no-data">Loading...</div>;
  }

  return (
    <div>
      <h1 className="page-title">Tesla Voting Power</h1>

      <div className="search-container">
        <input
          type="text"
          className="search-input"
          placeholder="Enter eSpace address..."
          value={searchAddr}
          onChange={(e) => setSearchAddr(e.target.value)}
        />
        <button
          className="search-button"
          onClick={() => {
            /* Already filtered by useMemo */
          }}
        >
          Search
        </button>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>Address</th>
              <th>Date</th>
              <th>POS</th>
              <th>ABC</th>
              <th>Votes</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.length > 0 ? (
              filteredData.map((row, index) => (
                <tr key={`${row.espaceAddr}-${row.snapshotDate}-${index}`}>
                  <td title={row.espaceAddr}>
                    {truncateAddress(row.espaceAddr)}
                  </td>
                  <td>{row.snapshotDate}</td>
                  <td>{row.posAmount.toLocaleString()}</td>
                  <td>{row.abcAmount.toLocaleString()}</td>
                  <td>{row.vote.toLocaleString()}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="no-data">
                  No data found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default TeslaPage;
