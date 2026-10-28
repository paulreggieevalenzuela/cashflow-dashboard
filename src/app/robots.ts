import type { MetadataRoute } from "next";

/** A private clinic system: no search engine should index any page. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
