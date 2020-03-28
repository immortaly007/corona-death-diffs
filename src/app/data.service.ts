import { Injectable, OnInit } from '@angular/core';
import { environment } from '../environments/environment';
import { isoCountries } from './isoCountries';
import { HttpClient } from '@angular/common/http';
import * as moment from 'moment';
import { ReplaySubject, Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DataService {

  dates: ReplaySubject<string[]> = new ReplaySubject<string[]>();
  countries: ReplaySubject<{ code: string, label: string }[]> = new ReplaySubject<{code: string, label: string}[]>();
  totalDeathsPerCountryPerDay: ReplaySubject<{ [countryCode: string]: number[] }> = new ReplaySubject<{[p: string]: number[]}>();
  deathDiffPerCountryPerDay: ReplaySubject<{ [countryCode: string]: number[] }> = new ReplaySubject<{[p: string]: number[]}>();
  globalDeathDiff: ReplaySubject<number[]> = new ReplaySubject<number[]>();

  totalReportedCasesPerCountryPerDay: ReplaySubject<{ [countryCode: string]: number[] }> = new ReplaySubject<{[p: string]: number[]}>();
  reportedCasesDiffPerCountryPerDay: ReplaySubject<{ [countryCode: string]: number[] }> = new ReplaySubject<{[p: string]: number[]}>();

  constructor(private http: HttpClient) {

    this.http.get(environment.dataEndpoint).subscribe((res: {data: any[], tokens: string[]}) => {

      // I don't like the non-ISO dates, so let's convert those first (this makes the data become sortable)
      res.data.forEach(e => e.date = DataService.apiToIsoDate(e.date));

      // let's also sort the data on date...
      res.data.sort((a, b) => a.date === b.date ? 0 : (a.date < b.date ? -1 : 1));

      console.log(res.data.filter(e => e.countrycode === 'NL'));

      const d = res.data;

      // Initialize "totalDeathsPerCountry"
      const countryCodes = [...new Set(d.map(cd => cd.countrycode).filter(cc => cc != null && cc.trim() !== ''))];
      console.log(countryCodes);
      this.countries.next(countryCodes.map(cc => ({
        code: cc,
        label: isoCountries[cc]
      })));

      // Fill "dates"
      const dates = [...new Set(d.map(e => e.date))].sort();
      this.dates.next(dates);

      // Initialize "total deaths per country"
      const totalDeathsPerCountryPerDay: { [countryCode: string]: number[] } = DataService.toPerCountryPerDay(d,  'deaths', dates, countryCodes);
      this.totalDeathsPerCountryPerDay.next(totalDeathsPerCountryPerDay);

      // Fill deathDiffPerCountryPerDay
      const deathDiffPerCountryPerDay = DataService.toDiffsPerCountryPerDay(totalDeathsPerCountryPerDay)
      this.deathDiffPerCountryPerDay.next(deathDiffPerCountryPerDay);

      // Fill globalDeathDiff
      const globalDeathDiff = new Array(dates.length).fill(0);
      Object.values(deathDiffPerCountryPerDay).forEach(dd => dd.forEach((v, i) => {
        globalDeathDiff[i] += v;
      }));
      this.globalDeathDiff.next(globalDeathDiff);

      // Fill "totalReportedInfectedPerCountryPerDay"
      const totalReportedCasesPerCountryPerDay = DataService.toPerCountryPerDay(d, 'cases', dates, countryCodes);
      this.totalReportedCasesPerCountryPerDay.next(totalReportedCasesPerCountryPerDay);

      // Fill "reportedCasesDiffPerCountryPerDay"
      const reportedCasesDiffPerCountryPerDay = DataService.toDiffsPerCountryPerDay(totalReportedCasesPerCountryPerDay);
      this.reportedCasesDiffPerCountryPerDay.next(reportedCasesDiffPerCountryPerDay);
    });
  }

  private static toPerCountryPerDay(data: any[], field: string, dates: string[], countryCodes: string[])
    : { [countryCode: string]: number[] } {

    const res: { [countryCode: string]: number[] } = {};
    countryCodes.forEach(c => res[c] = new Array(dates.length).fill(0));
    data.forEach(e => res[e.countrycode][dates.indexOf(e.date)] = +e[field]);
    return res;
  }

  private static toDiffsPerCountryPerDay(perCountryPerDay: { [countryCode: string]: number[] }) {
    const res: { [countryCode: string]: number[] } = {};
    for (const countryCode of Object.keys(perCountryPerDay)) {
      const totalPerDay = perCountryPerDay[countryCode];
      res[countryCode] = totalPerDay.map((data, i) => {
        if (i === 0) {
          return data;
        } else {
          return data - totalPerDay[i - 1];
        }
      });
    }
    return res;
  }

  private static apiToIsoDate(date: string) {
    return moment(date, 'MM/DD/YYYY').format('YYYY-MM-DD');
  }
}
