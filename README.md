# pactester

A Pure JS* implementation of [pactester](https://github.com/manugarg/pacparser).

## Installation

```sh
npm i -g pactester
```

## Usage

```sh
Usage: pactester [options]

Pure JS* implementation of pactester.

 * (Almost.  Currently still relies on c++.)

Options:
  -v              output the version number
  -p <pacfile>    PAC file to test (specify '-' to read from standard input)
  -u <url>        URL to test for
  -h <host>       Host part of the URL
  -c <client_ip>  client IP address (as returned by myIpAddress() function in PAC files),
                  defaults to IP address on which it is running.
  -f <urlslist>   a file containing list of URLs to be tested.
  -v              print version and exit
```