/**
 * CPU Scheduling Simulator
 * Version: 1.0.0
 * Description: Interactive simulator for FCFS, SJF, SRTF and Round Robin.
 * Input: Manually entered processes or XML workloads.
 * Output: Gantt chart, per-process timing metrics and averages.
 */

"use strict";

const $ = (id) => document.getElementById(id);

const processColors = [
  "#dce8cf",
  "#f1d997",
  "#d4e4ed",
  "#eed5c6",
  "#e3d6eb",
  "#cce5db"
];

const algorithmNames = {
  FCFS: "First-Come, First-Served",
  SJF: "Shortest Job First",
  SRTF: "Shortest Remaining Time First",
  RR: "Round Robin"
};

// ---------- Messages and result state ----------

function showMessage(message) {
  $("status").textContent = message;
}

function clearError() {
  $("error").textContent = "";
  $("error").hidden = true;
}

function showError(message) {
  $("error").textContent = message;
  $("error").hidden = false;
  showMessage("");
}

function hideResults() {
  $("results").hidden = true;
}

// ---------- Process table ----------
// Create editable process rows and invalidate outdated simulation results.

function addProcess(process) {
  const row = document.createElement("tr");
  row.dataset.processId = process.id;

  const idCell = document.createElement("td");
  const idLabel = document.createElement("span");

  idLabel.className = "process-id";
  idLabel.textContent = process.id;

  idCell.append(idLabel);
  row.append(idCell);

  const fields = [
    {
      name: "arrival",
      label: "Arrival time",
      value: process.arrival,
      min: 0
    },
    {
      name: "burst",
      label: "CPU burst",
      value: process.burst,
      min: 1
    }
  ];

  fields.forEach((field) => {
    const cell = document.createElement("td");
    const input = document.createElement("input");

    input.type = "number";
    input.value = field.value;
    input.min = field.min;
    input.step = "1";
    input.dataset.field = field.name;

    input.setAttribute(
      "aria-label",
      `${process.id}: ${field.label}`
    );

    input.addEventListener("input", () => {
      clearError();
      hideResults();

      showMessage(
        "Process details updated. Run the simulation again."
      );
    });

    cell.append(input);
    row.append(cell);
  });

  const actionCell = document.createElement("td");
  const deleteButton = document.createElement("button");

  deleteButton.type = "button";
  deleteButton.textContent = "Remove";
  deleteButton.className = "delete-button";

  deleteButton.addEventListener("click", () => {
    row.remove();
    clearError();
    hideResults();

    showMessage(`${process.id} removed.`);
  });

  actionCell.append(deleteButton);
  row.append(actionCell);

  $("process-body").append(row);
  hideResults();
}

function getNextProcessId() {
  const usedIds = new Set(
    [...$("process-body").rows].map(
      (row) => row.dataset.processId
    )
  );

  let number = 1;

  while (usedIds.has(`P${number}`)) {
    number++;
  }

  return `P${number}`;
}

// ---------- Input validation ----------
// Enforce nonnegative arrival times, positive bursts and safe integer values.

function readInteger(raw, minimum, label) {
  const text = String(raw ?? "").trim();

  if (text === "") {
    throw new Error(`${label} is required.`);
  }

  const value = Number(text);

  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(
      `${label} must be a safe integer greater than or equal to ${minimum}.`
    );
  }

  return value;
}

function readProcesses() {
  const rows = [...$("process-body").rows];

  if (rows.length === 0) {
    throw new Error("Add or import at least one process.");
  }

  const ids = new Set();

  return rows.map((row, index) => {
    const id = row.dataset.processId?.trim();

    if (!id) {
      throw new Error(`Process ${index + 1} has no ID.`);
    }

    if (ids.has(id)) {
      throw new Error(`Duplicate process ID: "${id}".`);
    }

    ids.add(id);

    const arrivalInput = row.querySelector(
      '[data-field="arrival"]'
    );

    const burstInput = row.querySelector(
      '[data-field="burst"]'
    );

    return {
      id,
      arrival: readInteger(
        arrivalInput.value,
        0,
        `${id}: arrival time`
      ),
      burst: readInteger(
        burstInput.value,
        1,
        `${id}: CPU burst`
      )
    };
  });
}

// ---------- XML parsing and validation ----------
// Validate the complete workload before replacing the current process table.

function readXmlInteger(element, attribute, minimum, label) {
  const raw = element.getAttribute(attribute);

  if (raw === null || !/^\d+$/.test(raw.trim())) {
    throw new Error(
      `${label} must be an integer greater than or equal to ${minimum}.`
    );
  }

  return readInteger(raw, minimum, label);
}

function parseWorkloadXml(text) {
  const parser = new DOMParser();

  const documentXml = parser.parseFromString(
    text,
    "application/xml"
  );

  if (
    documentXml.getElementsByTagName("parsererror").length > 0
  ) {
    throw new Error(
      "Invalid XML syntax. Check opening tags, closing tags and quotation marks."
    );
  }

  const root = documentXml.documentElement;

  if (root.tagName !== "workload") {
    throw new Error("The root element must be <workload>.");
  }

  const elements = [...root.children];

  if (elements.length === 0) {
    throw new Error(
      "The workload must contain at least one process."
    );
  }

  if (
    elements.some(
      (element) => element.tagName !== "process"
    )
  ) {
    throw new Error(
      "Only <process> elements are allowed inside <workload>."
    );
  }

  const ids = new Set();

  return elements.map((element, index) => {
    const id = element.getAttribute("id")?.trim();

    if (!id) {
      throw new Error(
        `Process ${index + 1} is missing a non-empty id attribute.`
      );
    }

    if (ids.has(id)) {
      throw new Error(`Duplicate process ID: "${id}".`);
    }

    ids.add(id);

    if (element.children.length > 0) {
      throw new Error(
        `${id}: use attributes for arrival and burst, not nested elements.`
      );
    }

    return {
      id,
      arrival: readXmlInteger(
        element,
        "arrival",
        0,
        `${id}: arrival`
      ),
      burst: readXmlInteger(
        element,
        "burst",
        1,
        `${id}: burst`
      )
    };
  });
}

// ---------- Shared scheduling helpers ----------
// Preserve original input order for deterministic tie-breaking and output.

// Earlier arrival wins; then earlier input position.
function compareArrival(a, b) {
  return a.arrival - b.arrival || a.index - b.index;
}

// Make a separate working copy without changing input data.
function createProcesses(input) {
  return input.map((process, index) => ({
    ...process,
    index,
    remaining: process.burst,
    firstStart: null,
    completion: null
  }));
}

function checkedEnd(start, duration) {
  const end = start + duration;

  if (!Number.isSafeInteger(end)) {
    throw new Error(
      "The resulting timeline exceeds the safe integer range."
    );
  }

  return end;
}

function addSegment(
  timeline,
  process,
  start,
  end,
  mergeAdjacent = true
) {
  if (end <= start) {
    return;
  }

  const index = process ? process.index : null;
  const previous = timeline[timeline.length - 1];

  if (
    mergeAdjacent &&
    previous &&
    previous.index === index &&
    previous.end === start
  ) {
    previous.end = end;
    return;
  }

  timeline.push({
    id: process ? process.id : null,
    index,
    start,
    end
  });
}

/** Calculate turnaround = completion - arrival, waiting = turnaround - burst,
 * and response = first CPU start - arrival. */
function buildResults(processes, timeline) {
  // processes remains in original input order.
  const results = processes.map((process) => {
    const turnaround =
      process.completion - process.arrival;

    return {
      ...process,
      turnaround,
      waiting: turnaround - process.burst,
      response: process.firstStart - process.arrival
    };
  });

  return { timeline, results };
}

// ---------- FCFS: non-preemptive ----------
// Execute processes in arrival order without interruption.

function simulateFCFS(input) {
  const processes = createProcesses(input);
  const ordered = [...processes].sort(compareArrival);

  const timeline = [];
  let time = 0;

  for (const process of ordered) {
    if (time < process.arrival) {
      addSegment(
        timeline,
        null,
        time,
        process.arrival
      );

      time = process.arrival;
    }

    process.firstStart = time;

    const end = checkedEnd(time, process.burst);

    addSegment(timeline, process, time, end);

    process.remaining = 0;
    process.completion = end;
    time = end;
  }

  return buildResults(processes, timeline);
}

// ---------- SJF: non-preemptive ----------
// Select the shortest burst among processes that have already arrived.

function simulateSJF(input) {
  const processes = createProcesses(input);
  const pending = [...processes];

  const timeline = [];
  let time = 0;

  while (pending.length > 0) {
    const ready = pending.filter(
      (process) => process.arrival <= time
    );

    // Nothing is ready: advance to the next arrival.
    if (ready.length === 0) {
      const nextArrival = pending.reduce(
        (earliest, process) =>
          Math.min(earliest, process.arrival),
        Infinity
      );

      addSegment(timeline, null, time, nextArrival);
      time = nextArrival;
      continue;
    }

    ready.sort(
      (a, b) =>
        a.burst - b.burst ||
        compareArrival(a, b)
    );

    const current = ready[0];

    current.firstStart = time;

    // Run the entire burst, even if new processes arrive.
    const end = checkedEnd(time, current.burst);

    addSegment(timeline, current, time, end);

    current.remaining = 0;
    current.completion = end;

    time = end;

    pending.splice(pending.indexOf(current), 1);
  }

  return buildResults(processes, timeline);
}

// ---------- SRTF: preemptive ----------
// Reconsider the running process at arrivals; shorter remaining jobs preempt.

function simulateSRTF(input) {
  const processes = createProcesses(input);
  const timeline = [];

  let time = 0;
  let completed = 0;
  let current = null;

  while (completed < processes.length) {
    const ready = processes.filter(
      (process) =>
        process.arrival <= time &&
        process.remaining > 0
    );

    if (ready.length === 0) {
      const nextArrival = processes.reduce(
        (earliest, process) =>
          process.remaining > 0
            ? Math.min(earliest, process.arrival)
            : earliest,
        Infinity
      );

      addSegment(timeline, null, time, nextArrival);

      time = nextArrival;
      current = null;
      continue;
    }

    ready.sort(
      (a, b) =>
        a.remaining - b.remaining ||
        compareArrival(a, b)
    );

    const candidate = ready[0];

    // Keep the current process when remaining times are equal.
    if (
      current === null ||
      current.remaining === 0 ||
      candidate.remaining < current.remaining
    ) {
      current = candidate;
    }

    if (current.firstStart === null) {
      current.firstStart = time;
    }

    const nextArrival = processes.reduce(
      (earliest, process) =>
        process.arrival > time
          ? Math.min(earliest, process.arrival)
          : earliest,
      Infinity
    );

    // Re-evaluate at the next arrival or completion.
    const duration = Math.min(
      current.remaining,
      nextArrival - time
    );

    const end = checkedEnd(time, duration);

    // Merge contiguous execution if no actual preemption occurs.
    addSegment(timeline, current, time, end);

    current.remaining -= duration;
    time = end;

    if (current.remaining === 0) {
      current.completion = time;
      completed++;
      current = null;
    }
  }

  return buildResults(processes, timeline);
}

// ---------- Round Robin ----------
// Rotate ready processes using a fixed, positive time quantum.

function simulateRR(input, quantum) {
  const processes = createProcesses(input);
  const arrivals = [...processes].sort(compareArrival);

  const timeline = [];
  const queue = [];

  let time = 0;
  let nextArrivalIndex = 0;
  let completed = 0;

  function enqueueArrivals() {
    while (
      nextArrivalIndex < arrivals.length &&
      arrivals[nextArrivalIndex].arrival <= time
    ) {
      queue.push(arrivals[nextArrivalIndex]);
      nextArrivalIndex++;
    }
  }

  while (completed < processes.length) {
    enqueueArrivals();

    if (queue.length === 0) {
      const nextTime = arrivals[nextArrivalIndex].arrival;

      addSegment(timeline, null, time, nextTime);

      time = nextTime;
      enqueueArrivals();
    }

    const current = queue.shift();

    if (current.firstStart === null) {
      current.firstStart = time;
    }

    const duration = Math.min(
      quantum,
      current.remaining
    );

    const end = checkedEnd(time, duration);

    // Do not merge RR slices, even for the same process.
    addSegment(timeline, current, time, end, false);

    current.remaining -= duration;
    time = end;

    // Arrivals at the quantum boundary enter before
    // the unfinished current process is re-enqueued.
    enqueueArrivals();

    if (current.remaining === 0) {
      current.completion = time;
      completed++;
    } else {
      queue.push(current);
    }
  }

  return buildResults(processes, timeline);
}

// ---------- Algorithm selection ----------

function simulate(processes, algorithm, quantum) {
  switch (algorithm) {
    case "FCFS":
      return simulateFCFS(processes);

    case "SJF":
      return simulateSJF(processes);

    case "SRTF":
      return simulateSRTF(processes);

    case "RR":
      return simulateRR(processes, quantum);

    default:
      throw new Error("Unknown scheduling algorithm.");
  }
}

// ---------- Result rendering ----------
// Render execution segments and timing metrics from the simulation output.

function renderGantt(timeline) {
  const gantt = $("gantt");
  gantt.replaceChildren();

  const totalTime = timeline[timeline.length - 1].end;

  timeline.forEach((segment, index) => {
    const block = document.createElement("div");
    block.className = "gantt-block";

    const duration = segment.end - segment.start;

    // Short segments retain the CSS minimum width for readability.
    block.style.flex = `${duration / totalTime} 0 0px`;

    const label = document.createElement("span");
    label.className = "gantt-label";

    const name =
      segment.id === null ? "Idle" : segment.id;

    label.textContent = name;

    if (segment.id === null) {
      block.classList.add("idle");
    } else {
      block.style.setProperty(
        "--process-color",
        processColors[
          segment.index % processColors.length
        ]
      );
    }

    const description =
      `${name}: ${segment.start}–${segment.end}` +
      ` (${duration} time units)`;

    block.title = description;
    block.setAttribute("aria-label", description);

    const startLabel = document.createElement("span");
    startLabel.className = "time-label";
    startLabel.textContent = segment.start;

    block.append(label, startLabel);

    if (index === timeline.length - 1) {
      const endLabel = document.createElement("span");

      endLabel.className = "time-label end";
      endLabel.textContent = segment.end;

      block.append(endLabel);
    }

    gantt.append(block);
  });
}

function renderResultTable(results) {
  const body = $("result-body");
  body.replaceChildren();

  results.forEach((process) => {
    const row = document.createElement("tr");

    const values = [
      process.id,
      process.arrival,
      process.burst,
      process.firstStart,
      process.completion,
      process.turnaround,
      process.waiting,
      process.response
    ];

    values.forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });

    body.append(row);
  });
}

function renderAverages(results) {
  function average(field) {
    const value = results.reduce(
      (sum, process) =>
        sum + process[field] / results.length,
      0
    );

    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  $("avg-turnaround").textContent = average("turnaround");
  $("avg-waiting").textContent = average("waiting");
  $("avg-response").textContent = average("response");
}

function renderResults(simulation, algorithm, quantum) {
  renderGantt(simulation.timeline);
  renderResultTable(simulation.results);
  renderAverages(simulation.results);

  let description = `${algorithm} · `;

  if (algorithm === "RR") {
    description += `Quantum = ${quantum}`;
  } else if (algorithm === "SRTF") {
    description += "Preemptive";
  } else {
    description += "Non-preemptive";
  }

  $("run-description").textContent =
    `${description} · Time units`;

  $("results").hidden = false;

  showMessage(
    `${algorithm} simulation completed for ` +
    `${simulation.results.length} processes.`
  );
}

// ---------- File import ----------
// Read local XML files through the browser File API; no server is required.

$("xml-file").addEventListener("change", () => {
  clearError();

  const file = $("xml-file").files[0];

  showMessage(
    file
      ? `Selected: ${file.name}. Click Load XML to import.`
      : "No file selected."
  );
});

$("load-xml").addEventListener("click", async () => {
  clearError();

  const file = $("xml-file").files[0];

  if (!file) {
    showError("Please select an XML file first.");
    return;
  }

  if (!file.name.toLowerCase().endsWith(".xml")) {
    showError(
      "Please select a file with the .xml extension."
    );
    return;
  }

  const button = $("load-xml");
  button.disabled = true;
  button.textContent = "Loading…";

  try {
    const text = await file.text();
    const processes = parseWorkloadXml(text);

    // Replace the table only after validation succeeds.
    $("process-body").replaceChildren();
    processes.forEach(addProcess);

    hideResults();

    showMessage(
      `${file.name} loaded: ${processes.length} processes imported.`
    );
  } catch (error) {
    showError(`Import failed: ${error.message}`);
  } finally {
    button.disabled = false;
    button.textContent = "Load XML";
  }
});

// ---------- Other controls ----------
// Update UI state whenever input data or algorithm selection changes.

$("add-process").addEventListener("click", () => {
  clearError();

  const id = getNextProcessId();

  addProcess({
    id,
    arrival: 0,
    burst: 1
  });

  showMessage(`${id} added.`);
});

$("algorithm").addEventListener("change", () => {
  clearError();
  hideResults();

  const algorithm = $("algorithm").value;

  $("quantum").disabled = algorithm !== "RR";

  showMessage(
    `${algorithmNames[algorithm]} selected. Ready to run.`
  );
});

$("quantum").addEventListener("input", () => {
  clearError();
  hideResults();

  showMessage(
    `Time quantum changed to: ${$("quantum").value}`
  );
});

$("run").addEventListener("click", () => {
  clearError();
  hideResults();

  try {
    const processes = readProcesses();
    const algorithm = $("algorithm").value;

    const quantum =
      algorithm === "RR"
        ? readInteger(
            $("quantum").value,
            1,
            "Time quantum"
          )
        : null;

    const simulation = simulate(
      processes,
      algorithm,
      quantum
    );

    renderResults(
      simulation,
      algorithm,
      quantum
    );
  } catch (error) {
    showError(error.message);
  }
});

// ---------- Initial state ----------

$("results").hidden = true;
$("error").hidden = true;
$("quantum").disabled = $("algorithm").value !== "RR";

showMessage(
  "Browse for an XML workload or add processes manually. " +
  "FCFS, SJF, SRTF and Round Robin are available."
);