import { dots, wilks, wilks2020, glossbrenner } from 'powerlifting-formulas';
import type { WeightUnit } from '@/lib/units/conversion';

export type MeetSex = 'male' | 'female';


export type MeetLiftsInput = {
  squat: number;
  bench: number;
  deadlift: number;
  bodyweight: number;
  sex: MeetSex;
  unit: WeightUnit;
};

export type MeetCoefficientResult = {
  total: number;
  wilks: number;
  wilks2020: number;
  dots: number;
  ipfgl: number;
};

export function calculateMeetTotal(input: Pick<MeetLiftsInput, 'squat' | 'bench' | 'deadlift'>): number {
  const total = input.squat + input.bench + input.deadlift;

  if (!Number.isFinite(total) || total <= 0) {
    throw new Error('INVALID_MEET_TOTAL');
  }

  return Number(total.toFixed(2));
}

export function calculateMeetCoefficients(input: MeetLiftsInput): MeetCoefficientResult {
  const total = calculateMeetTotal(input);

  if (!Number.isFinite(input.bodyweight) || input.bodyweight <= 0) {
    throw new Error('INVALID_BODYWEIGHT');
  }

  const gender = input.sex === 'male' ? 'male' : 'female';

  return {
    total,
    wilks: Number(wilks(input.bodyweight, total, gender, input.unit).toFixed(2)),
    wilks2020: Number(wilks2020(input.bodyweight, total, gender, input.unit).toFixed(2)),
    dots: Number(dots(input.bodyweight, total, gender, input.unit).toFixed(2)),
    ipfgl: Number(glossbrenner(input.bodyweight, total, gender, input.unit).toFixed(2)),
  };
}