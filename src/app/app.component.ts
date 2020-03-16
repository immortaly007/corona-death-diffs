import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LineChartComponent } from '@swimlane/ngx-charts';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  title = 'corona-deaths';

  data: any;
  dates: string[];
  totalDeathsPerCountry: { [countryCode: string]: number[]};
  deathDiffPerCountryPerDay: { [countryCode: string]: number[]};
  globalDeathDiff: number[];

  graphData: any;
  nlGraphData: any;

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


  constructor(private http: HttpClient) {
  }

  ngOnInit(): void {
    this.http.get('/assets/map-data.json').subscribe((d: any[]) => {
      this.data = d;
      this.totalDeathsPerCountry = {};
      // Initialize "totalDeathsPerCountry"
      const countryCodes: string[] = d[0].data.map(cd => cd.countrycode).filter(cc => cc != null && cc.trim() !== '');
      countryCodes.forEach(c => this.totalDeathsPerCountry[c] = []);

      // Fill "dates"
      this.dates = d.map(dateData => dateData.date);

      // Fill totalDeathsPerCountry codes
      for (let i = 0; i < d.length; i++) {
        for (const countryCode of countryCodes) {
          this.totalDeathsPerCountry[countryCode].push(+d[i].data.find(cd => cd.countrycode === countryCode).totaldeaths);
        }
      }

      // Fill deathDiffPerCountryPerDay
      this.deathDiffPerCountryPerDay = {};
      for (const countryCode of countryCodes) {
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

      console.log(this.dates);
      console.log(this.totalDeathsPerCountry);
      console.log(this.deathDiffPerCountryPerDay);
      console.log(this.globalDeathDiff);

      this.graphData = [this.buildGraphData('Global death diff', this.globalDeathDiff)];
      this.nlGraphData = [
        this.buildGraphData('Netherlands', this.deathDiffPerCountryPerDay.NL),
        this.buildGraphData('China', this.deathDiffPerCountryPerDay.CN),
        this.buildGraphData('Italy', this.deathDiffPerCountryPerDay.IT),
        this.buildGraphData('Iran', this.deathDiffPerCountryPerDay.IR),
        ];
      console.log(JSON.stringify(this.graphData));
    });
  }

  private buildGraphData(name: string, data: number[]) {
    return {
      name,
      series: data.map((gdd, i) => ({
        name: this.dates[i],
        value: gdd
      }))
    };
  }

}
