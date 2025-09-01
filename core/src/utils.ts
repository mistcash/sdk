export const devStr = (val: string) => devVal(val, '') as string;

export const devVal = <T,>(val: T, deflt: T | undefined = undefined) => localStorage.getItem('devVals') ? val : deflt;
