import {Component, OnInit} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {MultiSeries, Series} from '@swimlane/ngx-charts';
import {environment} from '../environments/environment';
import {isoCountries} from './isoCountries';

import * as moment from 'moment';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {


  constructor(private http: HttpClient) {
  }

  static readonly SMOOTH_AMOUNT = 0.5;
  title = 'corona-deaths';

  data: any;
  dates: string[];
  countryCodes: string[];
  countries: { code: string, label: string }[];
  totalDeathsPerCountry: { [countryCode: string]: number[] };
  deathDiffPerCountryPerDay: { [countryCode: string]: number[] };
  globalDeathDiff: number[];

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


  selectedCountries: { code: string, label: string }[] = [
    {code: 'NL', label: 'Netherlands'},
    {code: 'CN', label: 'China'},
    {code: 'IT', label: 'Italy'},
    {code: 'IR', label: 'Iran'},
  ];
  smoothing = true;

  selectedEstimateCountry = { code: 'NL', label: 'Netherlands'};
  estimateDeathRate = 1.0;
  estimateTimeTillDeath = 14;

  ngOnInit(): void {
    this.http.get(environment.dataEndpoint).subscribe((res: {data: any[], tokens: string[]}) => {

      // I don't like the non-ISO dates, so let's convert those first (this makes the data become sortable)
      res.data.forEach(e => e.date = this.apiToIsoDate(e.date));
      // let's also sort the data on date...
      res.data.sort((a, b) => a.date === b.date ? 0 : (a.date < b.date ? -1 : 1));

      const d = this.data = res.data;
      this.totalDeathsPerCountry = {};

      // Initialize "totalDeathsPerCountry"
      this.countryCodes = d.map(cd => cd.countrycode).filter(cc => cc != null && cc.trim() !== '');
      this.countryCodes = [...new Set(this.countryCodes)];
      console.log(this.countryCodes);
      this.countries = this.countryCodes.map(cc => ({
        code: cc,
        label: isoCountries[cc]
      }));

      // Initialize "total deaths per country"
      this.countryCodes.forEach(c => this.totalDeathsPerCountry[c] = []);

      // Fill "dates"
      this.dates = [...new Set(d.map(e => e.date))];


      // Old code
      // Fill totalDeathsPerCountry codes
      // for (let i = 0; i < d.length; i++) {
      //   for (const countryCode of this.countryCodes) {
      //     this.totalDeathsPerCountry[countryCode].push(+d[i].data.find(cd => cd.countrycode === countryCode).totaldeaths);
      //   }
      // }
      //
      // //FIXME: this.data.find() is undefined, don't know why
      // for (const day of this.dates) {
      //   for (const countryCode of this.countryCodes) {
      //     let num: number = this.data.find(cd => cd.countrycode === countryCode && cd.date == day).deaths;
      //     this.totalDeathsPerCountry[countryCode].push(num);
      //   }
      // }

      for (const entry of this.data) {
        const countryDeaths = this.totalDeathsPerCountry[entry.countrycode];
        if (this.totalDeathsPerCountry[entry.countrycode].length === 0) {
          // First entry, let's check how many dates we need to fill with zeroes
          const toFill = this.dates.indexOf(entry.date);
          for (let i = 0; i < toFill; i++) {
            countryDeaths.push(0);
          }
        }
        this.totalDeathsPerCountry[entry.countrycode].push(+entry.deaths);
      }

      // Fill deathDiffPerCountryPerDay
      this.deathDiffPerCountryPerDay = {};
      for (const countryCode of this.countryCodes) {
        const totalDeathsPerDay = this.totalDeathsPerCountry[countryCode];
        this.deathDiffPerCountryPerDay[countryCode] = totalDeathsPerDay.map((data, i) => {
          if (i === 0) {
            return data;
          } else {
            return data - totalDeathsPerDay[i - 1];
          }
        });
      }

      // Fill globalDeathDiff
      this.globalDeathDiff = new Array(this.dates.length).fill(0);
      Object.values(this.deathDiffPerCountryPerDay).forEach(dd => dd.forEach((v, i) => {
        this.globalDeathDiff[i] += v;
      }));

      // console.log(this.dates);
      // console.log(this.totalDeathsPerCountry);
      // console.log(this.deathDiffPerCountryPerDay);
      // console.log(this.globalDeathDiff);

      this.updateGlobalData();
      this.updatePerCountryGraphData();
      this.updateEstimatedInfectedData();
    });
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
    const remainingDeathDiffs = this.globalDeathDiff.map((v, i) => v - topCountryDeathDiffs[i]);

    this.graphData = topCountries
      .map(c => this.buildGraphData(c.label, this.deathDiffPerCountryPerDay[c.code], this.smoothing));
    this.graphData.push(this.buildGraphData('Other', remainingDeathDiffs, this.smoothing));
  }

  updatePerCountryGraphData() {

    const countriesSortedByDeaths = this.selectedCountries.map(c => ({code: c.code, label: c.label, deaths: this.totalForCountry(c.code)}));
    countriesSortedByDeaths.sort((c1, c2) => c1.deaths === c2.deaths ? 0 : (c1.deaths > c2.deaths ? -1 : 1));

    this.perCountryGraphData = countriesSortedByDeaths.map(c =>
      this.buildGraphData(c.label, this.deathDiffPerCountryPerDay[c.code], this.smoothing));
  }

  private buildGraphData(name: string, data: number[], smoothing: boolean = true): Series {

    let smoothedData: number[];
    // Smooth!
    if (smoothing) {
      smoothedData = this.smooth(data);
    } else {
      smoothedData = [...data];
    }

    smoothedData.splice(smoothedData.length - 1, 1);

    return {
      name,
      series: smoothedData.map((gdd, i) => ({
        name: this.dates[i],
        value: gdd
      }))
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

  updateEstimatedInfectedData() {

    let deathDiffs = [...this.deathDiffPerCountryPerDay[this.selectedEstimateCountry.code]];
    if (this.smoothing) {
      deathDiffs = this.smooth(deathDiffs);
    }

    const estimatedInfected = new Array(deathDiffs.length).fill(0);

    // TODO Extend the "dates" if their are deaths before day "estimateTimeTillDeath"
    for (let i = this.estimateTimeTillDeath; i < this.dates.length; i++) {
      estimatedInfected[i - this.estimateTimeTillDeath] = deathDiffs[i] / (this.estimateDeathRate / 100);
    }

    this.estimateInfectionsGraphData = [
      this.buildGraphData('# of deaths', deathDiffs, false),
      this.buildGraphData('Estimated # infected', estimatedInfected, false),
    ];

  }

  apiToIsoDate(date: string) {
    return moment(date, 'MM/DD/YYYY').format('YYYY-MM-DD');
    // const dateRegex = /^([0-9]+)\/([0-9]+)\/([0-9]+)$/;
    // const res = dateRegex.exec(date);
    // return moment(2000 + Number.parseInt(res[3], 10), Number.parseInt(res[1], 10) - 1, Number.parseInt(res[2], 10)).toISOString();
  }
}
