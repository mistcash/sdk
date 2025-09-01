
/**
 * devVal shortcut for empty string
 * @uses devVal
 */
export const devStr = (val: string) => devVal(val, '') as string;

/**
 * Dev util to preset defaults if devVals is set in localStorage
 * @param val value to set
 * @param deflt default value when no dev vals is set
 * @returns devVals ? val : deflt
 */
export const devVal = <T,>(val: T, deflt: T | undefined = undefined) => {
	return typeof window !== 'undefined' && window.localStorage.getItem('devVals') ? val : deflt
};
