import {Component, OnInit} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {MultiSeries, Series} from '@swimlane/ngx-charts';
import {environment} from '../environments/environment';
import {isoCountries} from './isoCountries';

import * as moment from 'moment';
import { DataService } from './data.service';
import { combineLatest } from 'rxjs';

import KalmanFilter from 'kalmanjs';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {

  static readonly SMOOTH_AMOUNT = 0.5;
  title = 'corona-deaths';

  dates: string[];
  countries: { code: string, label: string }[];
  totalDeathsPerCountry: { [countryCode: string]: number[] };
  globalDeathDiffs: number[];
  deathDiffPerCountryPerDay: { [countryCode: string]: number[] };
  reportedCasesDiffsPerCountryPerDay: { [countryCode: string]: number[] };

  graphData: MultiSeries;
  perCountryGraphData: MultiSeries;
  estimateInfectionsGraphData: MultiSeries;

  view: any[] = [1200, 500];

  // options
  legend = false;
  showLabels = true;
  animations = true;
  xAxis = true;
  yAxis = true;
  showYAxisLabel = true;
  showXAxisLabel = true;
  xAxisLabel = 'Date';
  yAxisLabel = 'Deaths';
  timeline = true;
  logY = false;


  selectedCountries: { code: string, label: string }[] = [
    {code: 'NL', label: 'Netherlands'},
    {code: 'CN', label: 'China'},
    {code: 'IT', label: 'Italy'},
    {code: 'IR', label: 'Iran'},
  ];
  smoothing = true;

  selectedEstimateCountry = { code: 'NL', label: 'The Netherlands'};
  estimateDeathRate = 1.0;
  estimateTimeTillDeath = 8;

  selectedCountryTotalInfectedEstimate: number;
  selectedCountryReportedTotalInfected: number;
  /**
   * Percentage of the population that is infected
   */
  estimatedInfectedPercentage: number;

  kalmanR = 0.1;
  kalmanQ = 0.5;
  kalmanA = 1.2;


  constructor(private dataService: DataService) {
  }

  ngOnInit(): void {

    // tslint:disable-next-line:max-line-length
    combineLatest([this.dataService.dates, this.dataService.countries,
      this.dataService.totalDeathsPerCountryPerDay, this.dataService.globalDeathDiff, this.dataService.deathDiffPerCountryPerDay,
      this.dataService.reportedCasesDiffPerCountryPerDay,
    ])
      .subscribe(([dates, countries, totalDeathsPerCountry, globalDeathDiffs, deathDiffPerCountryPerDay, reportedCasesDiff]) => {
        this.dates = dates;
        this.countries = countries;
        this.totalDeathsPerCountry = totalDeathsPerCountry;
        this.globalDeathDiffs = globalDeathDiffs;
        this.deathDiffPerCountryPerDay = deathDiffPerCountryPerDay;
        this.reportedCasesDiffsPerCountryPerDay = reportedCasesDiff;
        this.updateGraphData();
      });
      // console.log(this.dates);
      // console.log(this.totalDeathsPerCountry);
      // console.log(this.deathDiffPerCountryPerDay);
      // console.log(this.globalDeathDiff);

  }

  updateGraphData() {

    if (this.dates && this.countries && this.deathDiffPerCountryPerDay) {
      this.updateGlobalData();
      this.updatePerCountryGraphData();
      this.updateEstimatedInfectedData();
    }
  }

  private totalForCountry(code: string): number {
    return this.totalDeathsPerCountry[code][this.dates.length - 1];
  }

  updateGlobalData() {

    const countriesSortedByDeaths = this.countries.map(c => ({code: c.code, label: c.label, deaths: this.totalForCountry(c.code)}));
    countriesSortedByDeaths.sort((c1, c2) => c1.deaths === c2.deaths ? 0 : (c1.deaths > c2.deaths ? -1 : 1));

    const topCountries = countriesSortedByDeaths.slice(0, 7);
    const topCountryDeathDiffs = topCountries
      .map(c => this.deathDiffPerCountryPerDay[c.code])
      .reduce((a, b) => [...a].map((v, i) => v + b[i]), new Array(this.dates.length).fill(0));
    const remainingDeathDiffs = this.globalDeathDiffs.map((v, i) => v - topCountryDeathDiffs[i]);

    this.graphData = topCountries
      .map(c => this.buildGraphData(c.label, this.deathDiffPerCountryPerDay[c.code], this.smoothing));
    this.graphData.push(this.buildGraphData('Other', remainingDeathDiffs, this.smoothing));
  }

  updatePerCountryGraphData() {

    const countriesSortedByDeaths = this.selectedCountries.map(c => ({code: c.code, label: c.label, deaths: this.totalForCountry(c.code)}));
    countriesSortedByDeaths.sort((c1, c2) => c1.deaths === c2.deaths ? 0 : (c1.deaths > c2.deaths ? -1 : 1));

    let firstDateIndex = countriesSortedByDeaths.map(c => this.deathDiffPerCountryPerDay[c.code].findIndex(d => d > 0))
      .reduce((a, b) => a < 0 ? b : (b < 0 ? a : Math.min(a, b)), this.dates.length);
    if (firstDateIndex > 0) { firstDateIndex--; }

    this.perCountryGraphData = countriesSortedByDeaths.map(c =>
      this.buildGraphData(c.label, this.deathDiffPerCountryPerDay[c.code], this.smoothing, firstDateIndex));
  }


  updateEstimatedInfectedData() {

    let deathDiffs = [...this.deathDiffPerCountryPerDay[this.selectedEstimateCountry.code]];
    if (this.smoothing) {
      deathDiffs = this.smooth(deathDiffs);
    }

    const reportedCasesDiffs = [...this.reportedCasesDiffsPerCountryPerDay[this.selectedEstimateCountry.code]];

    const estimatedInfected: number[] = new Array(deathDiffs.length).fill(0);
    // TODO Extend the "dates" if their are deaths before day "estimateTimeTillDeath"
    for (let i = this.estimateTimeTillDeath; i < this.dates.length; i++) {
      estimatedInfected[i - this.estimateTimeTillDeath] = deathDiffs[i] / (this.estimateDeathRate / 100);
    }

    const estStart = estimatedInfected.findIndex(e => e > 0);
    const estEnd = estimatedInfected.length - [...estimatedInfected].reverse().findIndex(e => e > 0);
    console.log(estStart);
    console.log(estEnd);

    const estKalman = new Array(deathDiffs.length).fill(0);
    const kalmanOffset = estimatedInfected[estStart];
    const kalmanFilter = new KalmanFilter({
      // R is an estimate
      R: this.kalmanR,
      Q: this.kalmanQ,
      A: this.kalmanA
    });

    estimatedInfected
      .forEach((e, i) => {
        if (i >= estStart && i < estEnd) {
          estKalman[i] = kalmanFilter.filter(e - kalmanOffset) + kalmanOffset;
        }
      });

    // Unfortunately, the estimates only go until "estimateTimeTillDeath" days ago. We extrapolate the rest, based on the estimates of the last week:
    const derivativeDays = 5;
    const estDerivative = (estKalman[estEnd - 1] - estKalman[estEnd - derivativeDays - 1]) / derivativeDays;
    const lastEst = estKalman[estEnd - 1];
    for (let i = estEnd; i < this.dates.length; i++) {
      const day = (i - estEnd);
      estKalman[i] = kalmanFilter.filter(lastEst + (estDerivative * day) - kalmanOffset) + kalmanOffset;
    }

    estKalman.forEach((e, i) => { if (e < 0) { estKalman[i] = 0; } });
    estKalman.forEach((e, i) => estKalman[i] = Math.round(e));
    estimatedInfected.forEach((e, i) => estimatedInfected[i] = Math.round(e));

    let startDate = Math.min(
      deathDiffs.findIndex(d => d > 0),
      estStart,
      reportedCasesDiffs.findIndex(d => d > 0),
      );
    if (startDate < 0) { startDate = 0; } else if (startDate > 0) { startDate--; }

    this.selectedCountryTotalInfectedEstimate = estKalman.reduce((a, b) => a + b, 0 );
    this.selectedCountryReportedTotalInfected = reportedCasesDiffs.reduce((a, b) => a + b, 0);

    this.estimateInfectionsGraphData = [
      this.buildGraphData('Death per day', deathDiffs, false, startDate),
      // this.buildGraphData('Estimated new cases', estimatedInfected, this.smoothing, startDate),
      this.buildGraphData('Reported new cases per day', reportedCasesDiffs, false, startDate),
      this.buildGraphData('Estimated new cases per day', estKalman, false, startDate),
    ];

  }

  private buildGraphData(name: string, data: number[], smoothing: boolean = true, start = 0, end = this.dates.length): Series {

    let smoothedData: number[];
    // Smooth!
    if (smoothing) {
      smoothedData = this.smooth(data);
    } else {
      smoothedData = [...data];
    }

    // smoothedData.splice(smoothedData.length - 1, 1);

    return {
      name,
      series: smoothedData
        .map((d, i) => ({
          name: this.dates[i],
          value: this.logY ? (d <= 0 ? d : Math.log10(d)) : d
        }))
        .filter((_, i) => i >= start && i < end)
    };
  }

  private smooth(data: number[]): number[] {
    const smoothedData = [...data];
    for (let i = 0; i < data.length - 1; i++) {
      // Less then 10 is probably wrong...(sadly), especially if it greater than 10 the next day. lets borrow half of tomorrow
      if (data[i] < 10 && data[i + 1] > 10) {
        const smoothAmount = smoothedData[i + 1] * AppComponent.SMOOTH_AMOUNT;
        smoothedData[i] += smoothAmount;
        smoothedData[i + 1] -= smoothAmount;
      }
    }
    return smoothedData;
  }
}
