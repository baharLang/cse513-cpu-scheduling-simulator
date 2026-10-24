# CPU Scheduling Simulator

A browser-based CPU Scheduling Simulator developed for **CSE513 – Assignment 1**.

## Live Demo
[CPU Scheduling Simulator](https://baharLang.github.io/cse513-cpu-scheduling-simulator/)

## Supported Algorithms
- First-Come, First-Served (FCFS)
- Shortest Job First (SJF)
- Shortest Remaining Time First (SRTF)
- Round Robin (RR)

## Features
- Add, edit, and remove processes.
- Import XML workloads.
- Visualize CPU scheduling using Gantt charts.
- Calculate turnaround, waiting, and response times.
- Configure Round Robin time quantum.

## How to Run
1. Download or clone the repository.
2. Open `index.html` in Google Chrome.
3. Enter processes or load an XML workload.
4. Select an algorithm and run the simulation.

No additional installation or external dependencies are required.

## Limitations
- Single CPU with no I/O or context-switch overhead.
- CPU burst durations are known in advance.
- Tested using Google Chrome only.
