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
  totalDeathsPerCountry: ReplaySubject<{ [countryCode: string]: number[] }> = new ReplaySubject<{[p: string]: number[]}>();
  deathDiffPerCountryPerDay: ReplaySubject<{ [countryCode: string]: number[] }> = new ReplaySubject<{[p: string]: number[]}>();
  globalDeathDiff: ReplaySubject<number[]> = new ReplaySubject<number[]>();

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
      const totalDeathsPerCountry: { [countryCode: string]: number[] } = {};
      countryCodes.forEach(c => totalDeathsPerCountry[c] = new Array(dates.length).fill(0));

      for (const entry of d) {
        const dateIndex = dates.indexOf(entry.date);
        totalDeathsPerCountry[entry.countrycode][dateIndex] = +entry.deaths;
      }
      this.totalDeathsPerCountry.next(totalDeathsPerCountry);

      // Fill deathDiffPerCountryPerDay
      const deathDiffPerCountryPerDay: { [countryCode: string]: number[] } = {};
      for (const countryCode of countryCodes) {
        const totalDeathsPerDay = totalDeathsPerCountry[countryCode];
        deathDiffPerCountryPerDay[countryCode] = totalDeathsPerDay.map((data, i) => {
          if (i === 0) {
            return data;
          } else {
            return data - totalDeathsPerDay[i - 1];
          }
        });
      }
      this.deathDiffPerCountryPerDay.next(deathDiffPerCountryPerDay);

      // Fill globalDeathDiff
      const globalDeathDiff = new Array(dates.length).fill(0);
      Object.values(deathDiffPerCountryPerDay).forEach(dd => dd.forEach((v, i) => {
        globalDeathDiff[i] += v;
      }));
      this.globalDeathDiff.next(globalDeathDiff);
    });
  }

  private static apiToIsoDate(date: string) {
    return moment(date, 'MM/DD/YYYY').format('YYYY-MM-DD');
  }
}
