import sys

def main():
    with open("script.js", "r", encoding="utf-8") as f:
        lines = f.readlines()

    # Lines to exclude (0-indexed)
    # updateAllCharts: 29 to 49
    # initCalendar: 233 to 464
    # Saju (getFiveElements to updateTodaySaju): 676 to 968
    # Kospi, Stocks, drawHistoryChart: 1204 to 1355

    exclude_ranges = [
        (28, 49),
        (232, 464),
        (675, 968),
        (1203, 1355)
    ]

    # Additional cleanup in top lines
    # line 4: let offsets = { philosophy: 0, iching: 0, saju: 0 }; -> let offsets = { philosophy: 0, iching: 0 };
    # remove DOMContentLoaded calls
    
    with open("script_cleaned.js", "w", encoding="utf-8") as f:
        for i, line in enumerate(lines):
            # Check exclusions
            exclude = False
            for r in exclude_ranges:
                if r[0] <= i < r[1]:
                    exclude = True
                    break
            if exclude:
                continue
            
            if "let offsets =" in line:
                line = "let offsets = { philosophy: 0, iching: 0 };\n"
            
            if "initCalendar();" in line or "initKospi" in line or "initStocks" in line or "initSaju();" in line:
                continue
            if "updateAllCharts(period);" in line:
                continue
            if "const btns = document.querySelectorAll('.timeframe-btn');" in line:
                continue
            if "btns.forEach(btn => {" in line:
                continue
            if "btn.addEventListener('click', (e) => {" in line:
                continue
            if "btns.forEach(b => b.classList.remove('active'));" in line:
                continue
            if "e.target.classList.add('active');" in line:
                continue
            if "const period = e.target.getAttribute('data-period');" in line:
                continue
            if "});" in line and 10 <= i <= 20: # timeframe loop closure
                continue
                
            f.write(line)

if __name__ == "__main__":
    main()
