FROM mcr.microsoft.com/dotnet/sdk:10.0@sha256:35d40304542c8689331f8cab17c65926cdf48fe711e289321d71924b230a7d29 AS build
WORKDIR /src

COPY backend/Betcco.sln backend/
COPY backend/Directory.Build.props backend/
COPY backend/src/Betcco.Domain/Betcco.Domain.csproj backend/src/Betcco.Domain/
COPY backend/src/Betcco.Domain/packages.lock.json backend/src/Betcco.Domain/
COPY backend/src/Betcco.Application/Betcco.Application.csproj backend/src/Betcco.Application/
COPY backend/src/Betcco.Application/packages.lock.json backend/src/Betcco.Application/
COPY backend/src/Betcco.Infrastructure/Betcco.Infrastructure.csproj backend/src/Betcco.Infrastructure/
COPY backend/src/Betcco.Infrastructure/packages.lock.json backend/src/Betcco.Infrastructure/
COPY backend/src/Betcco.Api/Betcco.Api.csproj backend/src/Betcco.Api/
COPY backend/src/Betcco.Api/packages.lock.json backend/src/Betcco.Api/
RUN dotnet restore backend/src/Betcco.Api/Betcco.Api.csproj --locked-mode

COPY backend/src/ backend/src/
RUN dotnet publish backend/src/Betcco.Api/Betcco.Api.csproj --configuration Release --no-restore --output /app/publish /p:UseAppHost=false

# .NET 10 default tags use the supported Ubuntu Noble image. Debian tags are
# not published for .NET 10, so keep the platform tag explicit but portable.
FROM mcr.microsoft.com/dotnet/aspnet:10.0@sha256:2d584d8147faddb0d678c5748d47953e5b8e18621ed4fb7049a91381d9d7746f AS runtime
RUN apt-get update \
    && apt-get install --yes --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system betcco \
    && useradd --system --gid betcco --home-dir /app --create-home betcco \
    && mkdir --parents /var/lib/betcco/keys \
    && chown --recursive betcco:betcco /var/lib/betcco /app

WORKDIR /app
COPY --from=build --chown=betcco:betcco /app/publish ./

ENV ASPNETCORE_ENVIRONMENT=Production \
    ASPNETCORE_URLS=http://+:8080 \
    DOTNET_EnableDiagnostics=0 \
    DataProtection__KeysPath=/var/lib/betcco/keys

USER betcco
EXPOSE 8080
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD curl --fail --silent http://127.0.0.1:8080/health/ready || exit 1
ENTRYPOINT ["dotnet", "Betcco.Api.dll"]
