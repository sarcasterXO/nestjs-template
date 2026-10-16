export class TokenBucket {
	/**
	 * The bucket size and the max token use per second determine the rate at which tokens are added to and taken from the token bucket.
	 *
	 * The choice of bucket size and max token use per second depends on the specific use case. If you want to limit the rate at which requests are made,
	 * you could set the max token use per second to the maximum number of requests you want to allow in a second and set the bucket size to a number that
	 * would allow for some burst usage without exceeding the max token use per second.
	 * In general, it's a trade-off between allowing burst usage and limiting the overall rate of usage.
	 *
	 * @param bucketSize The bucket size represents the maximum number of tokens that the bucket can hold at a time.
	 * Once the number of tokens in the bucket reaches the bucket size, no more tokens will be added until some tokens are consumed.
	 *
	 * @param maxTokenUsePerSecond The max token use per second represents the maximum number of tokens that can be consumed from the bucket in a second.
	 * This value sets the rate at which the tokens are being consumed.
	 *
	 * In this example, the token bucket is created with a bucketSize of 100 and a maxTokenUsePerSecond of 100 / 60, meaning 100 tokens per 60 seconds,
	 * which is equivalent to 100 API calls per 60 seconds. The makeApiCall function will first check if a token can be taken from
	 * the bucket using the takeToken method.
	 * If the rate limit is not exceeded, it makes the API call. If the rate limit is exceeded, it waits for 1 second and calls itself again.
	 * @example
	 * const bucketSize = 100;
	 * const maxTokenUsePerSecond = 100 / 60;
	 * const tokenBucket = new TokenBucket(bucketSize, maxTokenUsePerSecond);
	 * async function makeApiCall() {
	 *  if (tokenBucket.takeToken()) {
	 *   // make the API call here
	 *   console.log('API call made');
	 *  } else {
	 *   console.log('Rate limit exceeded, waiting for next refill...');
	 *   await new Promise((resolve) => setTimeout(resolve, 1000));
	 *   makeApiCall();
	 *  }
	 * }
	 *
	 * for (let i = 0; i < 150; i++) {
	 *  makeApiCall();
	 * }
	 */
	public bucket: number;

	private lastRefill: number;

	public constructor(
		private readonly bucketSize: number,
		private readonly maxTokenUsePerSecond: number,
	) {
		this.bucket = bucketSize;
		this.lastRefill = Date.now();
	}

	public takeToken(): boolean {
		this.refillBucket();
		if (this.bucket > 0) {
			this.bucket--;
			return true;
		}

		return false;
	}

	private refillBucket(): void {
		const currentTime = Date.now();
		const timeSinceLastRefill = currentTime - this.lastRefill;
		const tokensToAdd = timeSinceLastRefill * (this.maxTokenUsePerSecond / 1_000);
		this.bucket = Math.min(this.bucket + tokensToAdd, this.bucketSize);
		this.lastRefill = currentTime;
	}
}
