# Local preview of the course site with the same Jekyll, kramdown, Rouge and
# plugin versions that GitHub Pages uses (the github-pages gem pins them).
#
#   docker compose up
#   open http://localhost:4000/kevat-2026/
#
# Without Compose:
#   docker build -t tira-site .
#   docker run --rm -it -p 4000:4000 -p 35729:35729 -v "$PWD":/site tira-site
FROM ruby:3.3-slim-bookworm

# Compilers for the gems with native extensions (nokogiri, commonmarker, ffi, ...).
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential git \
 && rm -rf /var/lib/apt/lists/*

# Jekyll reads the Markdown as UTF-8 only when the locale says so; with the
# image's default POSIX locale the build fails on the first "ä".
ENV LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    JEKYLL_ENV=development

WORKDIR /site
COPY Gemfile Gemfile.lock ./
RUN bundle install --jobs 4 \
 && rm -rf /usr/local/bundle/cache

EXPOSE 4000 35729

# The site is mounted at /site. The build output goes to /tmp/_site so that the
# container does not write root-owned files into the working copy.
CMD ["bundle", "exec", "jekyll", "serve", "--host", "0.0.0.0", "--port", "4000", "--livereload", "--destination", "/tmp/_site"]
