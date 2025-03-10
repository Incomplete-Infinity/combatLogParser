const fileInput = document.getElementById("file-input");
fileInput.addEventListener("change", handleFileSelection);

let combatData = {};
let dpsData = [];
let combatStartTime = null,
  combatEndTime = null;
let dpsChart = null,
  damageBreakdownChart = null;

function handleFileSelection() {
  if (!fileInput.files.length) return;
  toggleSpinner();
  combatData = {};
  dpsData = [];
  combatStartTime = null;
  combatEndTime = null;

  Array.from(fileInput.files).forEach((file) => parseLog(file));
}

function parseLog(file) {
  const reader = new FileReader();
  reader.onload = (event) => {
    const logLines = event.target.result.split(/\r?\n/);
    let timeDamageMap = {};

    logLines.forEach((line) => {
      // Extract timestamp
      const timeMatch = line.match(
        /^\[ (\d{4}.\d{2}.\d{2} \d{2}:\d{2}:\d{2}) \]/
      );
      if (!timeMatch) return;

      let timestamp = new Date(timeMatch[1].replace(/\./g, "-"));
      if (!combatStartTime || timestamp < combatStartTime)
        combatStartTime = timestamp;
      if (!combatEndTime || timestamp > combatEndTime)
        combatEndTime = timestamp;

      const elapsedSeconds = Math.floor((timestamp - combatStartTime) / 1000);

      // Extract damage details
      const combatMatch = line.match(
        /<b>(\d+)<\/b>.*?<font size=10>(to|from)<\/font> <b><color=0xffffffff>([^<]+)<\/b>.*?- ([^<]+) - (\w+)/
      );
      if (!combatMatch) return;

      const [, damage, direction, entity, weapon, hitQuality] = combatMatch.map(
        (x) => x?.trim() || ""
      );
      const dmg = parseInt(damage, 10);
      const isDamageDealt = direction === "to";

      // Track damage
      if (!combatData[entity]) {
        combatData[entity] = { dealt: {}, received: {}, weapons: {} };
      }

      if (isDamageDealt) {
        if (!combatData[entity].received["Total"])
          combatData[entity].received["Total"] = 0;
        combatData[entity].received["Total"] += dmg;
        if (!combatData[entity].weapons[weapon])
          combatData[entity].weapons[weapon] = { totalDamage: 0, hitTypes: {} };
        combatData[entity].weapons[weapon].totalDamage += dmg;
        if (!combatData[entity].weapons[weapon].hitTypes[hitQuality])
          combatData[entity].weapons[weapon].hitTypes[hitQuality] = 0;
        combatData[entity].weapons[weapon].hitTypes[hitQuality]++;
      } else {
        if (!combatData[entity].dealt["Total"])
          combatData[entity].dealt["Total"] = 0;
        combatData[entity].dealt["Total"] += dmg;
      }

      // Track DPS per second
      if (!timeDamageMap[elapsedSeconds]) {
        timeDamageMap[elapsedSeconds] = { dealt: 0, received: 0 };
      }
      timeDamageMap[elapsedSeconds].dealt += isDamageDealt ? dmg : 0;
      timeDamageMap[elapsedSeconds].received += !isDamageDealt ? dmg : 0;
    });

    // Fill missing time slots with zero damage
    dpsData = [];
    for (
      let time = 0;
      time <= (combatEndTime - combatStartTime) / 1000;
      time++
    ) {
      dpsData.push({
        time,
        dealt: timeDamageMap[time] ? timeDamageMap[time].dealt : 0,
        received: timeDamageMap[time] ? timeDamageMap[time].received : 0,
      });
    }

    console.log("Processed DPS Data:", dpsData);
    drawCharts();
    updateTable();
  };

  reader.readAsText(file);
}

function drawCharts() {
  const dpsCtx = document.getElementById("damage-over-time-canvas").getContext("2d");
  const damageBreakdownCtx = document
    .getElementById("damage-totals-canvas")
    .getContext("2d");

  (dpsChart) && dpsChart.destroy();
  (damageBreakdownChart) && damageBreakdownChart.destroy();

  // Generate time-based damage tracking
  let damageDealtData = [];
  let damageReceivedData = [];
  let maxTime = Math.round((combatEndTime - combatStartTime) / 1000);

  damageDealtData = dpsData.map((d) => ({ x: Number(d.time), y: d.dealt }));
  damageReceivedData = dpsData.map((d) => ({
    x: Number(d.time),
    y: d.received,
  }));

  // Draw DPS Graph
  dpsChart = new Chart(dpsCtx, {
    type: "line",
    data: {
      datasets: [
        {
          label: "Damage Dealt",
          data: damageDealtData,
          backgroundColor: "rgba(0, 0, 255, 0.3)",
          borderColor: "blue",
          borderWidth: 1,
        },
        {
          label: "Damage Received",
          data: damageReceivedData,
          backgroundColor: "rgba(255, 0, 0, 0.3)",
          borderColor: "red",
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        zoom: {
          zoom: {
            wheel: {
              enabled: true,
              mode: "x",
            },
            pan: {
              enabled: true,
              mode: "x",
            },
          },
          pinch: {
            enabled: true,
            mode: "x",
          },
          mode: "xy",
        },
        decimation: {
          enabled: true,
          algorithm: "lttb",
          samples: 50,
        },
      },
      scales: {
        x: {
          border: {
            color: "white",
            width: 1,
          },
          type: "linear",
          position: "bottom",
          title: {
            display: true,
            text: "Time (seconds from start)",
          },
          ticks: {
            autoSkip: true,
            maxTicksLimit: 20,
          },
        },
        y: {
          border: {
            color: "white",
            width: 1,
          },
          stacked: true,
          title: {
            display: true,
            text: "Damage",
          },
          suggestedMin: 0,
        },
      },
    },
  });

  console.log("DPS chart successfully created!"); // Debugging

  // Generate damage breakdown data
  let entities = Object.keys(combatData);
  let damageDealtValues = entities.map(
    (e) => combatData[e].dealt["Total"] || 0
  );
  let damageReceivedValues = entities.map(
    (e) => combatData[e].received["Total"] || 0
  );

  // Draw Damage Breakdown Chart
  damageBreakdownChart = new Chart(damageBreakdownCtx, {
    type: "bar",
    data: {
      labels: entities,
      datasets: [
        {
          label: "Total Damage Dealt",
          data: damageDealtValues,
          backgroundColor: "rgba(0, 0, 255, 0.3)",
          borderColor: "blue",
          borderWidth: 1,
        },
        {
          label: "Total Damage Received",
          data: damageReceivedValues,
          backgroundColor: "rgba(255, 0, 0, 0.3)",
          borderColor: "red",
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        zoom: {
          zoom: {
            wheel: {
              enabled: true,
              mode: "x",
            },
            pan: {
              enabled: true,
              mode: "x",
            },
            pinch: {
              enabled: true,
              mode: "x",
            },
            drag: {
              enabled: true,
              mode: "x",
            },
            mode: "xy",
          },
          legend: {
            position: "top",
          },
        },
        scales: {
          x: {
            border: {
              color: "white",
              width: 1,
            },
            title: {
              display: true,
              text: "Entities",
            },
          },
          y: {
            border: {
              color: "white",
              width: 1,
            },
            title: {
              display: true,
              text: "Total Damage",
            },
          },
        },
      },
    },
  });

  console.log("Damage breakdown chart successfully created!"); // Debugging
  toggleSpinner();
  showResults();
}

function updateTable() {
  const tbody = document.getElementById("combatTable").querySelector("tbody");
  tbody.innerHTML = "";

  Object.entries(combatData).forEach(([entity, data]) => {
    const row = document.createElement("tr");
    row.innerHTML = `
            <td>${entity}</td>
            <td>${data.dealt["Total"] || 0}</td>
            <td>${data.received["Total"] || 0}</td>
        `;
    tbody.appendChild(row);
  });
}

let accuracyData = {};

function calculateAccuracy() {
  Object.keys(combatData).forEach((entity) => {
    accuracyData[entity] = { totalShots: 0, totalHits: 0 };

    Object.keys(combatData[entity].weapons).forEach((weapon) => {
      let weaponData = combatData[entity].weapons[weapon];
      let totalShots = Object.values(weaponData.hitTypes).reduce(
        (a, b) => a + b,
        0
      );
      let totalHits = totalShots - (weaponData.hitTypes["misses"] || 0);

      accuracyData[entity].totalShots += totalShots;
      accuracyData[entity].totalHits += totalHits;
    });
  });

  console.log("Accuracy Data:", accuracyData);
  return accuracyData;
}

document.getElementById("accuracy-display").innerText = `Hits: ${
  accuracyData.totalHits
} / Shots: ${accuracyData.totalShots} (${(
  (accuracyData.totalHits / accuracyData.totalShots) *
  100
).toFixed(2)}%)`;

function toggleSpinner() {
  console.info("Toggling spinner");
  const spinner = document.getElementById("spinner-container");
  spinner.classList.toggle("d-none");
}

function showResults() {
  document.getElementById("results-container").classList.remove("d-none");
}
