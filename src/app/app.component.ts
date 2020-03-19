import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LineChartComponent, MultiSeries, Series } from '@swimlane/ngx-charts';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  title = 'corona-deaths';

  data: any;
  dates: string[];
  countryCodes: string[];
  countries: { code: string, label: string}[];
  totalDeathsPerCountry: { [countryCode: string]: number[]};
  deathDiffPerCountryPerDay: { [countryCode: string]: number[]};
  globalDeathDiff: number[];

  graphData: MultiSeries;
  perCountryGraphData: any;

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


  selectedCountries: { code: string, label: string}[] = [
    { code: 'NL', label: 'Netherlands'},
    { code: 'CN', label: 'China'},
    { code: 'IT', label: 'Italy'},
    { code: 'IR', label: 'Iran'},
  ];
  smoothing = true;

  static readonly SMOOTH_AMOUNT = 0.5;


  constructor(private http: HttpClient) {
  }

  ngOnInit(): void {
    this.http.get(environment.dataEndpoint).subscribe((d: any[]) => {
      this.data = d;
      this.totalDeathsPerCountry = {};
      // Initialize "totalDeathsPerCountry"
      this.countryCodes = d[0].data.map(cd => cd.countrycode).filter(cc => cc != null && cc.trim() !== '');
      this.countryCodes.forEach(c => this.totalDeathsPerCountry[c] = []);
      this.countries = this.countryCodes.map(cc => ({
        code: cc,
        label: d[0].data.find(cd => cd.countrycode === cc).countrylabel,
      }));

      // Fill "dates"
      this.dates = d.map(dateData => dateData.date);

      // Fill totalDeathsPerCountry codes
      for (let i = 0; i < d.length; i++) {
        for (const countryCode of this.countryCodes) {
          this.totalDeathsPerCountry[countryCode].push(+d[i].data.find(cd => cd.countrycode === countryCode).totaldeaths);
        }
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
    });
  }

  private totalForCountry(code: string): number {
    return this.totalDeathsPerCountry[code][this.dates.length - 1];
  }

  updateGlobalData() {

    const countriesSortedByDeaths = this.countries.map(c => ({ code: c.code, label: c.label, deaths: this.totalForCountry(c.code)}));
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

    const countriesSortedByDeaths = this.selectedCountries.map(c => ({ code: c.code, label: c.label, deaths: this.totalForCountry(c.code)}));
    countriesSortedByDeaths.sort((c1, c2) => c1.deaths === c2.deaths ? 0 : (c1.deaths > c2.deaths ? -1 : 1));

    this.perCountryGraphData = countriesSortedByDeaths.map(c => this.buildGraphData(c.label, this.deathDiffPerCountryPerDay[c.code], this.smoothing));
  }

  private buildGraphData(name: string, data: number[], smoothing: boolean = true): Series {

    let smoothedData: number[];
    // Smooth!
    if (smoothing) {
      smoothedData = [... data];
      for (let i = 0; i < data.length - 1; i++) {
        // Less then 10 is probably wrong...(sadly), especially if it greater than 10 the next day. lets borrow half of tomorrow
        if (data[i] < 10 && data[i + 1] > 10) {
          const smoothAmount = smoothedData[i + 1] * AppComponent.SMOOTH_AMOUNT;
          smoothedData[i] += smoothAmount;
          smoothedData[i + 1] -= smoothAmount;
        }
      }
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

}
